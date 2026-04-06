/**
 * Dice Presentation Trace Utility v2
 * 
 * Captures ONLY held-row state and transitions to diagnose held-dice swap bugs.
 * Filters out scatter-only / fly-in frames with zero held dice.
 * 
 * Activated via DiceTraceControl UI (REC/STOP buttons).
 */

export interface HeldDieMapping {
  originalIndex: number;
  value: number;
  slotIndexInHeldRow: number;
  transformSource: string;
  posX: number;
  posY: number;
}

export interface DicePresentationTraceEntry {
  timestamp: number;
  frameNumber: number;
  renderPath: 'normal' | 'freeze' | 'cached-opponent' | 'fly-in' | 'pre-roll-layout';
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;

  // Core held-row data
  heldDiceMappings: HeldDieMapping[];
  /** originalIndex order in held row (left to right) */
  heldSlotOrder: number[];

  // Registry state
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  registrySize: number;

  // Layout counts
  layoutHeldCount: number;
  layoutUnheldCount: number;

  // All dice summary (compact)
  allDiceSummary: Array<{
    idx: number;
    val: number;
    held: boolean;
    heldInLayout: boolean;
    row: 'held' | 'scatter' | 'animating' | 'hidden';
    slot: number | null;
    src: string;
  }>;

  // Held positions computed
  heldPositionsComputed: Array<{ x: number; y: number }>;

  // Source label for multi-source tracking
  diceSource: 'live' | 'cached-opponent' | 'freeze-snapshot' | 'pre-roll-mask';

  // Swap detection result for this frame
  swapDetected: string | null;
}

const MAX_ENTRIES = 500;
let traceBuffer: DicePresentationTraceEntry[] = [];
let runtimeEnabled = false;
let frameCounter = 0;
let lastHeldSlotOrder: number[] = [];
let lastHeldSlotMap: Map<number, number> = new Map(); // originalIndex -> slotIndex

/** Start recording at runtime */
export function startDicePresentationTrace(): void {
  runtimeEnabled = true;
  traceBuffer = [];
  frameCounter = 0;
  lastHeldSlotOrder = [];
  lastHeldSlotMap = new Map();
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

/** Get all swap events from the buffer */
export function getSwapEvents(): string[] {
  return traceBuffer
    .filter(e => e.swapDetected !== null)
    .map(e => e.swapDetected!);
}

export function getDicePresentationTraceBuffer(): DicePresentationTraceEntry[] {
  return [...traceBuffer];
}

export function clearDicePresentationTrace(): void {
  traceBuffer = [];
  frameCounter = 0;
  lastHeldSlotOrder = [];
  lastHeldSlotMap = new Map();
}

/**
 * Detect if any held die changed slot assignment without being unheld/reheld.
 * Returns description of swap or null if stable.
 */
function detectSwap(currentMappings: HeldDieMapping[]): string | null {
  if (currentMappings.length === 0) return null;
  if (lastHeldSlotMap.size === 0) {
    // First frame with held dice — seed and return
    currentMappings.forEach(m => lastHeldSlotMap.set(m.originalIndex, m.slotIndexInHeldRow));
    lastHeldSlotOrder = currentMappings.map(m => m.originalIndex);
    return null;
  }

  // Find dice that were held in both previous and current frames
  const commonDice = currentMappings.filter(m => lastHeldSlotMap.has(m.originalIndex));
  if (commonDice.length < 2) {
    // Can't swap with <2 common dice — just update
    lastHeldSlotMap.clear();
    currentMappings.forEach(m => lastHeldSlotMap.set(m.originalIndex, m.slotIndexInHeldRow));
    lastHeldSlotOrder = currentMappings.map(m => m.originalIndex);
    return null;
  }

  // Check if any common die changed slot
  const swaps: string[] = [];
  for (const m of commonDice) {
    const prevSlot = lastHeldSlotMap.get(m.originalIndex)!;
    if (prevSlot !== m.slotIndexInHeldRow) {
      swaps.push(`die${m.originalIndex}(v=${m.value}): slot ${prevSlot}→${m.slotIndexInHeldRow}`);
    }
  }

  // Update state
  lastHeldSlotMap.clear();
  currentMappings.forEach(m => lastHeldSlotMap.set(m.originalIndex, m.slotIndexInHeldRow));
  const prevOrder = [...lastHeldSlotOrder];
  lastHeldSlotOrder = currentMappings.map(m => m.originalIndex);

  if (swaps.length > 0) {
    return `HELD_SLOT_SWAP_DETECTED: ${swaps.join(', ')} | prevOrder=[${prevOrder}] currOrder=[${lastHeldSlotOrder}]`;
  }
  return null;
}

export interface TraceInput {
  renderPath: DicePresentationTraceEntry['renderPath'];
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;
  diceSource: DicePresentationTraceEntry['diceSource'];
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  heldPositionsComputed: Array<{ x: number; y: number }>;
  layoutHeldCount: number;
  layoutUnheldCount: number;
  diceDetails: Array<{
    originalIndex: number;
    value: number;
    isHeld: boolean;
    isHeldInLayout: boolean;
    displayedRow: 'held' | 'scatter' | 'animating' | 'hidden';
    slotIndexInHeldRow: number | null;
    transformSource: string;
    posX: number;
    posY: number;
  }>;
}

export function recordDicePresentationTrace(input: TraceInput): void {
  if (!runtimeEnabled) return;

  // FILTER: Only record when at least one die is in held row
  const heldDice = input.diceDetails.filter(d => d.displayedRow === 'held' && d.slotIndexInHeldRow !== null);
  const hasHeldDice = heldDice.length > 0;
  const hasRegistry = input.registryEntries.length > 0;

  if (!hasHeldDice && !hasRegistry) return; // Skip scatter-only frames

  frameCounter++;

  // Build held mappings
  const heldMappings: HeldDieMapping[] = heldDice
    .sort((a, b) => (a.slotIndexInHeldRow ?? 0) - (b.slotIndexInHeldRow ?? 0))
    .map(d => ({
      originalIndex: d.originalIndex,
      value: d.value,
      slotIndexInHeldRow: d.slotIndexInHeldRow!,
      transformSource: d.transformSource,
      posX: d.posX,
      posY: d.posY,
    }));

  const swapResult = detectSwap(heldMappings);

  const entry: DicePresentationTraceEntry = {
    timestamp: Date.now(),
    frameNumber: frameCounter,
    renderPath: input.renderPath,
    rollKey: input.rollKey,
    cacheKey: input.cacheKey,
    isObserver: input.isObserver,
    heldDiceMappings: heldMappings,
    heldSlotOrder: heldMappings.map(m => m.originalIndex),
    registryEntries: input.registryEntries,
    registrySize: input.registryEntries.length,
    layoutHeldCount: input.layoutHeldCount,
    layoutUnheldCount: input.layoutUnheldCount,
    allDiceSummary: input.diceDetails.map(d => ({
      idx: d.originalIndex,
      val: d.value,
      held: d.isHeld,
      heldInLayout: d.isHeldInLayout,
      row: d.displayedRow,
      slot: d.slotIndexInHeldRow,
      src: d.transformSource,
    })),
    heldPositionsComputed: input.heldPositionsComputed,
    diceSource: input.diceSource,
    swapDetected: swapResult,
  };

  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_ENTRIES) {
    traceBuffer = traceBuffer.slice(-MAX_ENTRIES);
  }

  // Console output for held frames only
  const heldSummary = heldMappings
    .map(m => `die${m.originalIndex}(v=${m.value})@slot${m.slotIndexInHeldRow}[${m.transformSource}]`)
    .join(', ');

  if (swapResult) {
    console.warn(`[DICE TRACE] ⚠️ ${swapResult}`);
  } else {
    console.log(
      `[DICE TRACE] f${frameCounter} path=${input.renderPath} src=${input.diceSource} rollKey=${input.rollKey} held=[${heldSummary}] registry=[${input.registryEntries.map(e => e.dieIndex).join(',')}]`
    );
  }
}

// Legacy compat
export function detectOrderingSwap(
  _prev: DicePresentationTraceEntry,
  _curr: DicePresentationTraceEntry
): string | null {
  return _curr.swapDetected ?? null;
}
