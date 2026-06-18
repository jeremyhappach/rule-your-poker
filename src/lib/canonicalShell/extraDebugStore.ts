/**
 * EXTRA DEBUG STORE — sibling stores for the on-screen debug pills that
 * supplement FELT DEBUG (dealer indicator, seat ownership, dealer
 * affordance). Each store is a tiny ring buffer keyed by the
 * full-snapshot signature; producers call the `record*` helpers from
 * effects/render to publish a snapshot, the pill subscribes via
 * useSyncExternalStore.
 *
 * Kept intentionally simple — no console logs, just visible-pill +
 * copy-to-clipboard so smoke screenshots prove regressions.
 */

const MAX_ENTRIES = 20;

function makeStore<T>() {
  let entries: Array<{ ts: number } & T> = [];
  const listeners = new Set<() => void>();
  let lastSig: string | null = null;
  return {
    record(entry: T) {
      const sig = JSON.stringify(entry);
      if (sig === lastSig) return;
      lastSig = sig;
      const next = entries.concat({ ...entry, ts: Date.now() });
      entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
    },
    get() { return entries; },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export interface DealerDbgEntry {
  context: 'cribbage';
  dealerPlayerId: string | null;
  localPlayerId: string | null;
  opponentPlayerIds: string[];
  localDealerVisible: boolean;
  opponentDealerVisible: Record<string, boolean>;
  identitySource: string;
  seatClusterSource: string;
}

export interface SeatOwnershipEntry {
  context: 'cribbage';
  winSequencePhase: string;
  canonicalSeat: string;
  legacySeat: string;
  chipDiscVisible: Record<string, boolean>;
  animationChipVisible: boolean;
  chipDiscCount: number;
}

export interface DealerAffordanceEntry {
  game: string;
  identityDealerVisible: boolean;
  seatDealerVisible: boolean;
  legacyDealerVisible: boolean;
  callerId: string | null;
  dealerId: string | null;
}

export const dealerDbgStore = makeStore<DealerDbgEntry>();
export const seatOwnershipStore = makeStore<SeatOwnershipEntry>();
export const dealerAffordanceStore = makeStore<DealerAffordanceEntry>();
