/**
 * FELT DEBUG STORE
 *
 * In-memory ring buffer of felt-plate commitment transitions. Producers
 * call `recordFeltDebug(entry)`; subscribers (the on-screen pill) render
 * the last 20 distinct snapshots. Only emits when at least one tracked
 * field changes.
 */

export interface FeltDebugEntry {
  ts: number; // epoch ms
  phase: string;
  status: string;
  isSessionWaitingTable: boolean;
  hasCommittedDealerGame: boolean;
  hasRoundContext: boolean;
  selectedDealerGame: string | null;
  selectedStakes: number | string | null;
  displayPlate: 'BRAND' | 'GAME' | 'AMBIGUOUS';
  displayGame: string;
  displayStakes: string;
  gameSource: string;
  stakesSource: string;
  fallbackReason: string;
}

const MAX_ENTRIES = 20;
const entries: FeltDebugEntry[] = [];
const listeners = new Set<() => void>();

function signature(e: Omit<FeltDebugEntry, 'ts'>): string {
  return JSON.stringify(e);
}

let lastSig: string | null = null;

export function recordFeltDebug(entry: Omit<FeltDebugEntry, 'ts'>): void {
  const sig = signature(entry);
  if (sig === lastSig) return;
  lastSig = sig;
  entries.push({ ...entry, ts: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function getFeltDebugEntries(): FeltDebugEntry[] {
  return entries.slice();
}

export function subscribeFeltDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
