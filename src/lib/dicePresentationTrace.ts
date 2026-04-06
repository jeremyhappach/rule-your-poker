/**
 * Dice Presentation Trace Utility
 * 
 * Captures every held-row ordering decision for diagnosis of held-dice swap bugs.
 * Enabled via: ?debug_dice_trace=1 or localStorage ptp_debug_dice_trace = "1"
 */

export interface DicePresentationTraceEntry {
  timestamp: number;
  renderPath: 'normal' | 'freeze' | 'cached-opponent' | 'fly-in' | 'pre-roll-layout';
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;
  registrySnapshot: Array<{ dieIndex: number; holdOrder: number }>;
  registrySortedByOriginalIndex: number[];
  diceSnapshot: Array<{
    originalIndex: number;
    value: number;
    isHeld: boolean;
    isHeldInLayout: boolean;
    displayedRow: 'held' | 'scatter' | 'animating' | 'hidden';
    slotIndexInHeldRow: number | null;
    transformSource: string;
    reactKey: string;
  }>;
  heldPositionsComputed: Array<{ x: number; y: number }>;
  layoutHeldCount: number;
  layoutUnheldCount: number;
}

const MAX_ENTRIES = 200;
let traceBuffer: DicePresentationTraceEntry[] = [];
let enabled: boolean | null = null;

function checkEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    const params = new URLSearchParams(window.location.search);
    const qFlag = params.get('debug_dice_trace');
    if (qFlag === '' || qFlag === '1' || qFlag === 'true') {
      enabled = true;
      return true;
    }
    enabled = window.localStorage.getItem('ptp_debug_dice_trace') === '1';
    return enabled;
  } catch {
    enabled = false;
    return false;
  }
}

export function isDicePresentationTraceEnabled(): boolean {
  return checkEnabled();
}

export function recordDicePresentationTrace(entry: DicePresentationTraceEntry): void {
  if (!checkEnabled()) return;
  
  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_ENTRIES) {
    traceBuffer = traceBuffer.slice(-MAX_ENTRIES);
  }
  
  // Log to console for immediate visibility
  const heldSlots = entry.diceSnapshot
    .filter(d => d.displayedRow === 'held')
    .map(d => `die${d.originalIndex}(v=${d.value})@slot${d.slotIndexInHeldRow}[${d.transformSource}]`)
    .join(', ');
  
  console.log(
    `[DICE TRACE] path=${entry.renderPath} rollKey=${entry.rollKey} held=[${heldSlots}] registry=[${entry.registrySortedByOriginalIndex.join(',')}]`
  );
}

export function getDicePresentationTraceBuffer(): DicePresentationTraceEntry[] {
  return [...traceBuffer];
}

export function clearDicePresentationTrace(): void {
  traceBuffer = [];
}

/**
 * Helper to detect ordering swaps between two consecutive trace entries.
 * Returns description of any swaps found, or null if ordering is stable.
 */
export function detectOrderingSwap(
  prev: DicePresentationTraceEntry,
  curr: DicePresentationTraceEntry
): string | null {
  const prevHeld = prev.diceSnapshot
    .filter(d => d.displayedRow === 'held')
    .sort((a, b) => (a.slotIndexInHeldRow ?? 0) - (b.slotIndexInHeldRow ?? 0));
  const currHeld = curr.diceSnapshot
    .filter(d => d.displayedRow === 'held')
    .sort((a, b) => (a.slotIndexInHeldRow ?? 0) - (b.slotIndexInHeldRow ?? 0));
  
  if (prevHeld.length !== currHeld.length) return null; // count changed, not a swap
  if (prevHeld.length < 2) return null; // can't swap with <2
  
  // Check if same dice are present but in different slot order
  const prevOrder = prevHeld.map(d => d.originalIndex);
  const currOrder = currHeld.map(d => d.originalIndex);
  
  if (prevOrder.length === currOrder.length &&
      prevOrder.every((v, i) => currOrder.includes(v)) &&
      !prevOrder.every((v, i) => v === currOrder[i])) {
    return `SWAP DETECTED: prev=[${prevOrder.join(',')}] curr=[${currOrder.join(',')}] ` +
      `prevPath=${prev.renderPath} currPath=${curr.renderPath} ` +
      `prevRollKey=${prev.rollKey} currRollKey=${curr.rollKey}`;
  }
  
  return null;
}
