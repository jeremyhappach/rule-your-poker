/**
 * Dice Presentation Trace Utility v3
 * 
 * Captures ACTUAL TRANSFORM application per die to diagnose visual swap bugs.
 * The slot/registry layer is proven stable — this traces the render/transform layer.
 * 
 * Activated via DiceTraceControl UI (REC/STOP buttons).
 */

export interface DieRenderDecision {
  originalIndex: number;
  value: number;
  isHeld: boolean;
  isHeldInLayout: boolean;
  displayedRow: 'held' | 'scatter' | 'animating' | 'hidden' | 'frozen';
  slotIndexInHeldRow: number | null;

  // Transform resolution chain
  transformOwner: string; // e.g. "held:stable-slot", "held:layout", "held:cache", "scatter:stable", "freeze"
  intendedPos: { x: number; y: number } | null; // from slot assignment
  actualPos: { x: number; y: number } | null; // final transform applied
  actualTransform: string; // full CSS transform string
  reactKey: string;

  // Resolution chain visibility
  hadRegistryPos: boolean;
  hadLayoutPos: boolean;
  hadCachedHeldPos: boolean;
  hadCachedScatterPos: boolean;
  hadStableScatterPos: boolean;
  hadFrozenTransform: boolean;
}

export interface DicePresentationTraceEntry {
  timestamp: number;
  frameNumber: number;
  renderPath: 'normal' | 'freeze' | 'fly-in' | 'pre-roll-layout';
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;

  // Per-die render decisions (the actual transforms applied)
  dieRenderDecisions: DieRenderDecision[];

  // Registry state
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  registrySize: number;

  // Layout counts
  layoutHeldCount: number;
  layoutUnheldCount: number;

  // Held positions computed for this registry size
  heldPositionsComputed: Array<{ x: number; y: number }>;

  // Mismatch detection
  transformMismatch: string | null;
  // Position swap detection (two held dice exchanged X positions)
  positionSwapDetected: string | null;
}

const MAX_ENTRIES = 500;
let traceBuffer: DicePresentationTraceEntry[] = [];
let runtimeEnabled = false;
let frameCounter = 0;
// Track previous frame's held dice actual positions for swap detection
let lastHeldPositions: Map<number, { x: number; y: number }> = new Map();

/** Start recording at runtime */
export function startDicePresentationTrace(): void {
  runtimeEnabled = true;
  traceBuffer = [];
  frameCounter = 0;
  lastHeldPositions = new Map();
}

/** Stop recording at runtime */
export function stopDicePresentationTrace(): void {
  runtimeEnabled = false;
}

/** Check if runtime recording is active */
export function isDicePresentationTraceRecording(): boolean {
  return runtimeEnabled;
}

export function isDicePresentationTraceEnabled(): boolean {
  return runtimeEnabled;
}

/** Get trace as JSON string for copy/export */
export function getDicePresentationTraceJSON(): string {
  return JSON.stringify(traceBuffer, null, 2);
}

/** Get all mismatch/swap events from the buffer */
export function getSwapEvents(): string[] {
  return traceBuffer
    .filter(e => e.transformMismatch !== null || e.positionSwapDetected !== null)
    .map(e => e.transformMismatch ?? e.positionSwapDetected!);
}

export function getDicePresentationTraceBuffer(): DicePresentationTraceEntry[] {
  return [...traceBuffer];
}

export function clearDicePresentationTrace(): void {
  traceBuffer = [];
  frameCounter = 0;
  lastHeldPositions = new Map();
}

/**
 * Detect transform mismatches: if a die is held in layout, its actual position
 * should match the intended held-slot position. If not, something is overriding.
 */
function detectTransformMismatch(decisions: DieRenderDecision[]): string | null {
  const mismatches: string[] = [];
  for (const d of decisions) {
    if (d.isHeldInLayout && d.intendedPos && d.actualPos) {
      const dx = Math.abs(d.intendedPos.x - d.actualPos.x);
      const dy = Math.abs(d.intendedPos.y - d.actualPos.y);
      if (dx > 1 || dy > 1) {
        mismatches.push(
          `die${d.originalIndex}(v=${d.value}): intended(${d.intendedPos.x.toFixed(1)},${d.intendedPos.y.toFixed(1)}) actual(${d.actualPos.x.toFixed(1)},${d.actualPos.y.toFixed(1)}) owner=${d.transformOwner}`
        );
      }
    }
  }
  return mismatches.length > 0
    ? `TRANSFORM_MISMATCH: ${mismatches.join(' | ')}`
    : null;
}

/**
 * Detect position swap: two held dice exchanged X positions between frames.
 */
function detectPositionSwap(decisions: DieRenderDecision[]): string | null {
  const currentHeld = decisions.filter(d => d.isHeldInLayout && d.actualPos);
  if (currentHeld.length < 2 || lastHeldPositions.size < 2) {
    // Update tracking
    lastHeldPositions = new Map();
    currentHeld.forEach(d => {
      if (d.actualPos) lastHeldPositions.set(d.originalIndex, d.actualPos);
    });
    return null;
  }

  // Check if any two dice swapped X positions
  const swaps: string[] = [];
  for (const d of currentHeld) {
    const prevPos = lastHeldPositions.get(d.originalIndex);
    if (!prevPos || !d.actualPos) continue;
    const dx = Math.abs(d.actualPos.x - prevPos.x);
    if (dx > 5) {
      // This die moved significantly — check if another die took its old position
      for (const other of currentHeld) {
        if (other.originalIndex === d.originalIndex) continue;
        if (!other.actualPos) continue;
        const otherPrevPos = lastHeldPositions.get(other.originalIndex);
        if (!otherPrevPos) continue;
        // Did 'other' move to where 'd' was, and 'd' moved to where 'other' was?
        const otherTookMySpot = Math.abs(other.actualPos.x - prevPos.x) < 3;
        const iTookOtherSpot = Math.abs(d.actualPos.x - otherPrevPos.x) < 3;
        if (otherTookMySpot && iTookOtherSpot) {
          const key = [d.originalIndex, other.originalIndex].sort().join('-');
          const msg = `POSITION_SWAP: die${d.originalIndex}↔die${other.originalIndex} x(${prevPos.x.toFixed(0)}↔${otherPrevPos.x.toFixed(0)}) owner=${d.transformOwner}/${other.transformOwner}`;
          if (!swaps.some(s => s.includes(key))) swaps.push(msg);
        }
      }
    }
  }

  // Update tracking
  lastHeldPositions = new Map();
  currentHeld.forEach(d => {
    if (d.actualPos) lastHeldPositions.set(d.originalIndex, d.actualPos);
  });

  return swaps.length > 0 ? swaps.join(' | ') : null;
}

export interface TraceInput {
  renderPath: DicePresentationTraceEntry['renderPath'];
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  heldPositionsComputed: Array<{ x: number; y: number }>;
  layoutHeldCount: number;
  layoutUnheldCount: number;
  dieRenderDecisions: DieRenderDecision[];
}

export function recordDicePresentationTrace(input: TraceInput): void {
  if (!runtimeEnabled) return;

  // FILTER: Only record when at least one die is held or in held layout
  const hasHeld = input.dieRenderDecisions.some(d => d.isHeldInLayout || d.displayedRow === 'held' || d.displayedRow === 'frozen');
  const hasRegistry = input.registryEntries.length > 0;
  if (!hasHeld && !hasRegistry) return;

  frameCounter++;

  const mismatch = detectTransformMismatch(input.dieRenderDecisions);
  const swap = detectPositionSwap(input.dieRenderDecisions);

  const entry: DicePresentationTraceEntry = {
    timestamp: Date.now(),
    frameNumber: frameCounter,
    renderPath: input.renderPath,
    rollKey: input.rollKey,
    cacheKey: input.cacheKey,
    isObserver: input.isObserver,
    dieRenderDecisions: input.dieRenderDecisions,
    registryEntries: input.registryEntries,
    registrySize: input.registryEntries.length,
    layoutHeldCount: input.layoutHeldCount,
    layoutUnheldCount: input.layoutUnheldCount,
    heldPositionsComputed: input.heldPositionsComputed,
    transformMismatch: mismatch,
    positionSwapDetected: swap,
  };

  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_ENTRIES) {
    traceBuffer = traceBuffer.slice(-MAX_ENTRIES);
  }

  // Console output
  if (mismatch) {
    console.warn(`[DICE TRACE] ⚠️ ${mismatch}`);
  }
  if (swap) {
    console.warn(`[DICE TRACE] 🔄 ${swap}`);
  }

  if (!mismatch && !swap) {
    const heldSummary = input.dieRenderDecisions
      .filter(d => d.isHeldInLayout)
      .map(d => `die${d.originalIndex}(v=${d.value})@x=${d.actualPos?.x.toFixed(0)}[${d.transformOwner}]`)
      .join(', ');
    console.log(
      `[DICE TRACE] f${frameCounter} path=${input.renderPath} rollKey=${input.rollKey} held=[${heldSummary}]`
    );
  }
}

// Legacy compat
export function detectOrderingSwap(
  _prev: DicePresentationTraceEntry,
  _curr: DicePresentationTraceEntry
): string | null {
  return _curr.positionSwapDetected ?? _curr.transformMismatch ?? null;
}
