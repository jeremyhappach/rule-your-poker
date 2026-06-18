/**
 * FELT DEBUG STORE
 *
 * In-memory ring buffer of felt-plate commitment transitions. Producers
 * call `recordFeltDebug(entry)`; subscribers (the on-screen pill) render
 * the last 20 distinct snapshots. Only emits when at least one tracked
 * field changes.
 */

export type CommittedDealerGameReason =
  | 'waiting_for_players'
  | 'game_selection'
  | 'dealer_selection'
  | 'ante_decision'
  | 'in_progress'
  | 'game_over'
  | 'teardown'
  | 'unknown';

export interface FeltDebugEntry {
  ts: number; // epoch ms
  phase?: string;
  status?: string;
  committedDealerGameReason?: CommittedDealerGameReason;
  isSessionWaitingTable?: boolean;
  hasCommittedDealerGame?: boolean;
  hasRoundContext?: boolean;
  selectedDealerGame?: string | null;
  selectedStakes?: number | string | null;
  displayPlate?: 'BRAND' | 'GAME' | 'AMBIGUOUS';
  displayGame?: string;
  displayStakes?: string;
  gameSource?: string;
  stakesSource?: string;
  fallbackReason?: string;
  /** What the legacy `!renderRoundContext` contract would publish to the shell felt. */
  legacyIsWaitingPhase?: boolean;
  /** True iff legacyIsWaitingPhase would (under current shell wiring) override the GAME plate. */
  legacyCanInfluenceFeltPlate?: boolean;

  // --- NEW RENDER TRACE FIELDS ---
  publisher?: string | null;
  publisherTable?: string | null;
  renderedPlate?: string | null;
  renderedGame?: string | null;
  renderedStakes?: string | number | null;
  renderSource?: 'published' | 'sticky' | 'lobby' | 'initial' | string;
  renderFrame?: number;
  publishedGame?: string | null;
  publishedStakes?: string | number | null;
  publishedPlate?: string | null;
  stickyGame?: string | null;
  stickyStakes?: string | number | null;
  stickyPlate?: string | null;
}

export type FeltRenderTraceContext = Pick<
  FeltDebugEntry,
  | 'publisher'
  | 'publisherTable'
  | 'publishedGame'
  | 'publishedStakes'
  | 'publishedPlate'
  | 'stickyGame'
  | 'stickyStakes'
  | 'stickyPlate'
  | 'renderSource'
>;

const MAX_ENTRIES = 20;
let entries: FeltDebugEntry[] = [];
let latestRenderFields: Omit<FeltDebugEntry, 'ts'> = {};
const listeners = new Set<() => void>();

function signature(e: Omit<FeltDebugEntry, 'ts'>): string {
  return JSON.stringify(e);
}

let lastSig: string | null = null;

export function recordFeltDebug(entry: Omit<FeltDebugEntry, 'ts'>): void {
  const sig = signature({ ...entry, ...latestRenderFields });
  if (sig === lastSig) return;
  lastSig = sig;
  const next = entries.concat({ ...entry, ...latestRenderFields, ts: Date.now() });
  entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function recordFeltRenderDebug(entry: Omit<FeltDebugEntry, 'ts'>): void {
  latestRenderFields = entry;
  const latest = entries[entries.length - 1];
  if (latest) {
    const merged = { ...latest, ...entry, ts: Date.now() };
    const sig = signature(merged);
    if (sig === lastSig) return;
    lastSig = sig;
    entries = entries.slice(0, -1).concat(merged);
  } else {
    const sig = signature(entry);
    if (sig === lastSig) return;
    lastSig = sig;
    entries = [{ ...entry, ts: Date.now() }];
  }
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function getFeltDebugEntries(): FeltDebugEntry[] {
  return entries;
}

export function subscribeFeltDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
