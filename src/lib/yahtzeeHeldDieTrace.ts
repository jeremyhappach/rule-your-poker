/**
 * Yahtzee Held-Die Corruption Trace
 *
 * Captures per-die state tuples at three pipeline stages:
 *   1. Authoritative update accepted (DB → sync gate)
 *   2. Presentation state cutover (sync gate → viewState)
 *   3. Final render boundary (DiceTableLayout render decisions)
 *
 * Detects four invariant violations:
 *   - yahtzee-held-die-rendered-in-scatter
 *   - yahtzee-held-die-reanimated
 *   - yahtzee-value-hold-mismatch
 *   - yahtzee-cross-roll-state-reuse
 */

import { persistInvariantViolation } from './persistSyncDebugEvent';
import { isDebugChannel } from './debugChannels';

// ── Toggle ────────────────────────────────────────────────────
// Verbose tuple capture is explicitly opt-in. Impossible-state checks remain
// always-on at their exact live-dice call site.

let _consoleLogCounter = 0;
const CONSOLE_SAMPLE_RATE = 10; // log 1 in N trace events

/**
 * Keep optional trace work outside the caller's render/effect stack and prevent
 * instrumentation failures from reaching the application's global error UI.
 */
export function runYahtzeeHeldDiagnostic(
  task: () => void | Promise<void>,
): Promise<void> {
  return Promise.resolve()
    .then(task)
    .catch(() => undefined);
}

export function isYahtzeeHeldTraceEnabled(): boolean {
  return isDebugChannel('yahtzee-held');
}

// ── Per-die tuple ─────────────────────────────────────────────

export interface DieTuple {
  dieIndex: number;
  value: number;
  isHeld: boolean;
  visualZone: 'scatter' | 'held' | 'animating' | 'frozen' | 'hidden' | 'unknown';
  visualPositionKey: string; // e.g. "held:2" or "scatter:stable:3"
  sourceLayer: 'authoritative' | 'presentation' | 'render';
  renderReason: string;
  previousValue: number | null;
  previousIsHeld: boolean | null;
  previousVisualZone: string | null;
  previousRollGeneration: string | null;
}

export interface HeldDieTraceEvent {
  gameId: string;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number;
  turnPlayerId: string | null;
  rollNumber: number;
  rollGeneration: string | null; // rollKey
  sourceLayer: 'authoritative' | 'presentation' | 'render';
  renderReason: string;
  dice: DieTuple[];
  timestamp: number;
}

// ── Previous-frame state for delta detection ──────────────────

type PrevDieState = {
  value: number;
  isHeld: boolean;
  visualZone: string;
  rollGeneration: string | null;
};

const prevStateByLayer: Record<string, Map<number, PrevDieState>> = {};

function getPrevKey(gameId: string, sourceLayer: string): string {
  return `${gameId}:${sourceLayer}`;
}

function getPrev(gameId: string, sourceLayer: string, dieIndex: number): PrevDieState | null {
  const key = getPrevKey(gameId, sourceLayer);
  return prevStateByLayer[key]?.get(dieIndex) ?? null;
}

function setPrev(gameId: string, sourceLayer: string, dieIndex: number, state: PrevDieState): void {
  const key = getPrevKey(gameId, sourceLayer);
  if (!prevStateByLayer[key]) prevStateByLayer[key] = new Map();
  prevStateByLayer[key]!.set(dieIndex, state);
}

export function resetYahtzeeHeldTrace(gameId?: string): void {
  if (gameId) {
    for (const key of Object.keys(prevStateByLayer)) {
      if (key.startsWith(`${gameId}:`)) delete prevStateByLayer[key];
    }
  } else {
    for (const key of Object.keys(prevStateByLayer)) delete prevStateByLayer[key];
  }
}

// ── Ring buffer for recent events (in-memory forensics) ───────

const MAX_TRACE_EVENTS = 200;
const traceBuffer: HeldDieTraceEvent[] = [];

export function getYahtzeeHeldTraceBuffer(): readonly HeldDieTraceEvent[] {
  return traceBuffer;
}

// ── Core trace function ───────────────────────────────────────

export function traceYahtzeeHeldDie(event: HeldDieTraceEvent): void {
  // Always buffer for forensic access
  traceBuffer.push(event);
  if (traceBuffer.length > MAX_TRACE_EVENTS) traceBuffer.splice(0, traceBuffer.length - MAX_TRACE_EVENTS);

  // Update prev state
  for (const die of event.dice) {
    setPrev(event.gameId, event.sourceLayer, die.dieIndex, {
      value: die.value,
      isHeld: die.isHeld,
      visualZone: die.visualZone,
      rollGeneration: event.rollGeneration,
    });
  }

  // Sampled console log (1-in-N) to avoid spam
  _consoleLogCounter++;
  if (_consoleLogCounter % CONSOLE_SAMPLE_RATE === 0) {
    const heldDice = event.dice.filter(d => d.isHeld);
    const scatterDice = event.dice.filter(d => d.visualZone === 'scatter');
    console.log(
      `[YAHTZEE_HELD_TRACE] ${event.sourceLayer} reason=${event.renderReason} roll=${event.rollNumber} gen=${event.rollGeneration?.slice(-12) ?? 'null'}`,
      `held=[${heldDice.map(d => `${d.dieIndex}:${d.value}`).join(',')}]`,
      `scatter=[${scatterDice.map(d => `${d.dieIndex}:${d.value}`).join(',')}]`,
    );
  }
}

// ── Convenience: build tuples from raw dice arrays ────────────

export function buildDieTuples(
  dice: { value: number; isHeld: boolean }[],
  sourceLayer: 'authoritative' | 'presentation' | 'render',
  renderReason: string,
  gameId: string,
  rollGeneration: string | null,
  /** For render layer: per-die zone/position from DiceTableLayout decisions */
  renderDecisions?: { displayedRow: string; transformOwner: string; slotIndexInHeldRow: number | null }[],
): DieTuple[] {
  return dice.map((d, i) => {
    const prev = getPrev(gameId, sourceLayer, i);
    const decision = renderDecisions?.[i];

    let visualZone: DieTuple['visualZone'] = d.isHeld ? 'held' : 'scatter';
    let visualPositionKey = d.isHeld ? `held:${i}` : `scatter:${i}`;

    if (decision) {
      visualZone = decision.displayedRow as DieTuple['visualZone'];
      visualPositionKey = decision.slotIndexInHeldRow !== null
        ? `${decision.displayedRow}:${decision.transformOwner}:${decision.slotIndexInHeldRow}`
        : `${decision.displayedRow}:${decision.transformOwner}:${i}`;
    }

    return {
      dieIndex: i,
      value: d.value,
      isHeld: d.isHeld,
      visualZone,
      visualPositionKey,
      sourceLayer,
      renderReason,
      previousValue: prev?.value ?? null,
      previousIsHeld: prev?.isHeld ?? null,
      previousVisualZone: prev?.visualZone ?? null,
      previousRollGeneration: prev?.rollGeneration ?? null,
    };
  });
}

// ── Invariant checks ──────────────────────────────────────────

/**
 * INV-1: yahtzee-held-die-rendered-in-scatter
 * A die with isHeld=true in authoritative state is rendered in scatter zone.
 */
export function checkHeldDieInScatter(
  gameId: string, handNumber: number, roundId: string | null,
  authDice: { isHeld: boolean }[],
  renderDecisions: { displayedRow: string; originalIndex: number }[],
): void {
  for (const rd of renderDecisions) {
    const authDie = authDice[rd.originalIndex];
    if (authDie?.isHeld && rd.displayedRow === 'scatter') {
      const payload = { dieIndex: rd.originalIndex, authIsHeld: true, renderZone: rd.displayedRow };
      console.error('[INVARIANT] yahtzee-held-die-rendered-in-scatter', payload);
      persistInvariantViolation(gameId, 'yahtzee', handNumber, 'yahtzee-held-die-rendered-in-scatter', payload, roundId);
    }
  }
}

/**
 * INV-2: yahtzee-held-die-reanimated
 * A die was in held zone last frame but is now in scatter/animating.
 */
export function checkHeldDieReanimated(
  gameId: string, handNumber: number, roundId: string | null,
  renderDecisions: { displayedRow: string; originalIndex: number; value: number; isHeld: boolean }[],
): void {
  for (const rd of renderDecisions) {
    const prev = getPrev(gameId, 'render', rd.originalIndex);
    if (prev && prev.isHeld && (prev.visualZone === 'held' || prev.visualZone === 'frozen') &&
        (rd.displayedRow === 'scatter' || rd.displayedRow === 'animating') && rd.isHeld) {
      const payload = {
        dieIndex: rd.originalIndex,
        value: rd.value,
        prevZone: prev.visualZone,
        currZone: rd.displayedRow,
        prevRollGen: prev.rollGeneration,
        isHeld: rd.isHeld,
      };
      console.error('[INVARIANT] yahtzee-held-die-reanimated', payload);
      persistInvariantViolation(gameId, 'yahtzee', handNumber, 'yahtzee-held-die-reanimated', payload, roundId);
    }
  }
}

/**
 * INV-3: yahtzee-value-hold-mismatch
 * Authoritative value for a held die differs from rendered value.
 */
export function checkValueHoldMismatch(
  gameId: string, handNumber: number, roundId: string | null,
  authDice: { value: number; isHeld: boolean }[],
  renderDecisions: { originalIndex: number; value: number; isHeld: boolean }[],
): void {
  for (const rd of renderDecisions) {
    const authDie = authDice[rd.originalIndex];
    if (authDie?.isHeld && rd.isHeld && authDie.value !== rd.value) {
      const payload = {
        dieIndex: rd.originalIndex,
        authValue: authDie.value,
        renderValue: rd.value,
      };
      console.error('[INVARIANT] yahtzee-value-hold-mismatch', payload);
      persistInvariantViolation(gameId, 'yahtzee', handNumber, 'yahtzee-value-hold-mismatch', payload, roundId);
    }
  }
}

/**
 * INV-4: yahtzee-cross-roll-state-reuse
 * A render frame uses dice state from a previous rollGeneration (stale rollKey).
 */
export function checkCrossRollStateReuse(
  gameId: string, handNumber: number, roundId: string | null,
  currentRollGeneration: string | null,
  renderDecisions: { originalIndex: number; value: number }[],
): void {
  if (!currentRollGeneration) return;
  for (const rd of renderDecisions) {
    const prev = getPrev(gameId, 'render', rd.originalIndex);
    if (prev && prev.rollGeneration && prev.rollGeneration !== currentRollGeneration && prev.value === rd.value) {
      // Value carried over from a different roll — could be stale state reuse
      // Only flag if value is non-zero (zeros are expected on new turns)
      if (rd.value > 0) {
        const payload = {
          dieIndex: rd.originalIndex,
          value: rd.value,
          prevRollGen: prev.rollGeneration.slice(-20),
          currRollGen: currentRollGeneration.slice(-20),
        };
        // Sampled console warn — not persisted as invariant (too noisy)
        if (_consoleLogCounter % CONSOLE_SAMPLE_RATE === 0) {
          console.warn('[TRACE] yahtzee-cross-roll-state-reuse', payload);
        }
      }
    }
  }
}
