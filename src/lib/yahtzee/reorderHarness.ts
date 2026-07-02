/**
 * Yahtzee Reorder Harness
 *
 * Deterministic 3-roll scenario driving the REAL non-host roll/hold/reducer/
 * render path. When armed, `rollYahtzeeDice` consumes forced values from the
 * per-die queue below instead of calling `Math.random()`. All other pipeline
 * stages (hold toggle, DB write, sync, presentation, DiceTableLayout render,
 * transport, animation) run unmodified.
 *
 * Scenario (physical die-id order 0..4):
 *   Roll 1: [5, 2, 3, 4, 2]  — all five dice consume forced values
 *   (hold dice 0..3 via real toggle)
 *   Roll 2: die 4 → 2        — dice 0..3 preserved by real `isHeld` gate
 *   Roll 3: die 4 → 1        — dice 0..3 preserved by real `isHeld` gate
 *
 * NOT a permanent RNG override: consumes the queue in strict order and
 * disarms automatically once exhausted (or via `resetYahtzeeReorderHarness`).
 * Falls through to `Math.random()` if the queue is empty for any reason —
 * fail-open so an unexpected extra roll never blocks the game.
 */

export type YahtzeeReorderHarnessStatus =
  | 'idle'
  | 'armed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

interface HarnessState {
  status: YahtzeeReorderHarnessStatus;
  queue: (number | null)[][];
  nextRollIdx: number;
  armedAtMs: number | null;
  runId: string | null;
  eligibility: {
    isYahtzeeTurn: boolean;
    isLocalTurn: boolean;
    isNonHost: boolean;
    playerId: string | null;
  };
  listeners: Set<() => void>;
}

const SCENARIO: (number | null)[][] = [
  [5, 2, 3, 4, 2], // roll 1 — everything freshly rolled
  [null, null, null, null, 2], // roll 2 — dice 0..3 held, die 4 → 2
  [null, null, null, null, 1], // roll 3 — dice 0..3 held, die 4 → 1
];

const state: HarnessState = {
  status: 'idle',
  queue: [],
  nextRollIdx: 0,
  armedAtMs: null,
  runId: null,
  eligibility: {
    isYahtzeeTurn: false,
    isLocalTurn: false,
    isNonHost: false,
    playerId: null,
  },
  listeners: new Set(),
};

function notify(): void {
  state.listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* swallow */
    }
  });
}

export function subscribeYahtzeeReorderHarness(cb: () => void): () => void {
  state.listeners.add(cb);
  return () => {
    state.listeners.delete(cb);
  };
}

export function getYahtzeeReorderHarnessSnapshot(): {
  status: YahtzeeReorderHarnessStatus;
  nextRollIdx: number;
  totalRolls: number;
  eligibility: HarnessState['eligibility'];
  armedAtMs: number | null;
  runId: string | null;
} {
  return {
    status: state.status,
    nextRollIdx: state.nextRollIdx,
    totalRolls: SCENARIO.length,
    eligibility: { ...state.eligibility },
    armedAtMs: state.armedAtMs,
    runId: state.runId,
  };
}

export function setYahtzeeReorderHarnessEligibility(
  next: Partial<HarnessState['eligibility']>,
): void {
  const prev = state.eligibility;
  state.eligibility = { ...prev, ...next };
  notify();
}

export function isYahtzeeReorderHarnessArmed(): boolean {
  return state.status === 'armed' || state.status === 'in_progress';
}

export function armYahtzeeReorderHarness(): { ok: boolean; reason?: string; runId?: string } {
  const el = state.eligibility;
  if (!el.isYahtzeeTurn) return { ok: false, reason: 'not in a Yahtzee turn' };
  if (!el.isLocalTurn) return { ok: false, reason: 'not your turn' };
  if (!el.isNonHost) return { ok: false, reason: 'local player must be non-host' };
  state.queue = SCENARIO.map((row) => row.slice());
  state.nextRollIdx = 0;
  state.status = 'armed';
  state.armedAtMs = Date.now();
  state.runId = `yhz-reorder-${state.armedAtMs}-${Math.random().toString(36).slice(2, 8)}`;
  notify();
  return { ok: true, runId: state.runId };
}

export function resetYahtzeeReorderHarness(reason: 'manual' | 'complete' | 'cancel' = 'manual'): void {
  state.queue = [];
  state.nextRollIdx = 0;
  state.status = reason === 'complete' ? 'completed' : reason === 'cancel' ? 'cancelled' : 'idle';
  // Preserve runId so post-completion snapshots still identify the run.
  notify();
}

/**
 * Called by `rollYahtzeeDice` (module-level) for every physical die that is
 * being rerolled. Returns a forced value when the harness is armed AND has a
 * value queued for this die on the current roll. Otherwise returns `null`
 * and the caller falls back to `Math.random()`.
 *
 * When the last unheld die of the last scripted roll is consumed, the
 * harness transitions to `completed` automatically.
 */
export function consumeYahtzeeReorderHarnessValue(dieIndex: number): number | null {
  if (!isYahtzeeReorderHarnessArmed()) return null;
  const rollIdx = state.nextRollIdx;
  const row = state.queue[rollIdx];
  if (!row) {
    resetYahtzeeReorderHarness('complete');
    return null;
  }
  const v = row[dieIndex];
  if (typeof v !== 'number') return null;
  row[dieIndex] = null; // one-shot consume
  state.status = 'in_progress';
  notify();
  return v;
}

/**
 * Called by `rollYahtzeeDice` (module-level) AFTER a roll finishes, so the
 * harness advances to the next scripted roll for the next `handleRoll` call.
 * Advances only when the harness is armed.
 */
export function advanceYahtzeeReorderHarnessRoll(): void {
  if (!isYahtzeeReorderHarnessArmed()) return;
  state.nextRollIdx += 1;
  if (state.nextRollIdx >= SCENARIO.length) {
    resetYahtzeeReorderHarness('complete');
    return;
  }
  notify();
}
