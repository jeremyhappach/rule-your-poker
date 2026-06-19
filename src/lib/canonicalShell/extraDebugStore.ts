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
  // DOM-scraped per-opponent dealer pip diagnostics:
  dealerPipMounted: Record<string, boolean>;
  dealerPipActiveAttr: Record<string, string>;
  dealerPipVisible: Record<string, boolean>; // computedStyle visibility !== invisible
  dealerPipRect: Record<string, string>;     // "x,y,w,h" or "0,0,0,0"
  dealerPipZ: Record<string, string>;        // z-index chain (own / nearest stacking)
  dealerPipClipped: Record<string, boolean>; // rect outside cluster ancestor bounds
}

export type SeatChipRenderOwner = {
    renderedChip: 'static disc' | 'fly chip';
    ownerSeatId: string | null;
    component: string;
    renderedSeatId: string | null;
    renderOwner?: string;
    rect?: string;
  };

export interface SeatOwnershipEntry {
  context: 'cribbage' | 'seat-cluster-lifecycle';
  winSequencePhase?: string;
  participantId?: string[];
  winnerSeatId?: string | null;
  loserSeatId?: string | null;
  loserSeatIds?: string[];
  seatId?: string[] | Record<string, string[]>;
  status?: Record<string, string[]>;
  mountedCount?: Record<string, number>;
  mountedBy?: Record<string, string[]>;
  renderPath?: Record<string, string[]>;
  canonicalSeatClusterMounted?: Record<string, boolean>;
  chipDiscMounted?: Record<string, boolean>;
  seatProjectionSource?: Record<string, string[]>;
  teardownReason?: Record<string, string>;
  observerTransition?: boolean;
  timeoutTransition?: boolean;
  duplicateParticipantIds?: string[];
  canonicalSeat?: string;
  legacySeat?: string;
  staticDiscOwner?: Record<string, string | null>;
  flyOwnerSeatId?: Record<string, string[]>;
  staticDiscVisible?: Record<string, boolean>;
  flyVisible?: Record<string, boolean>;
  renderOwners?: Record<string, SeatChipRenderOwner[]>;
  chipDiscVisible?: Record<string, boolean>;
  animationChipVisible?: boolean;
  chipDiscCount?: number;
  // Per-seat chip count — canonical disc + portal fly chip. The
  // invariant is `perSeatChipCount[seat] == 1` for every seat at
  // every phase. `invariantHolds` summarises that contract.
  perSeatChipCount?: Record<string, number>;
  invariantHolds?: boolean;
  // Suppression diagnostics per opponent:
  hideChipBubbleProp?: Record<string, boolean>;    // what JSX passed
  hideChipBubbleSource?: Record<string, string>;   // why
  domChipDiscPresent?: Record<string, boolean>;    // [data-chip-center] under cluster
  domChipFlyCount?: number;                        // [data-cribbage-chip-fly] count
  shouldSuppressChipDisc?: Record<string, boolean>;
  invariantFailure?: {
    seatId: string;
    staticDisc: boolean;
    flyPortal: number;
    renderOwners: SeatChipRenderOwner[];
  } | null;
}


export interface DealerAffordanceEntry {
  game: string;
  identityDealerVisible: boolean;
  seatDealerVisible: boolean;
  legacyDealerVisible: boolean;
  callerId: string | null;
  dealerId: string | null;
}

export interface OverlayOwnershipEntry {
  // Per-slot child counts and owner labels scraped from
  // [data-shell-overlay="<slot>"] descendants. ownerLabels arrays may
  // contain duplicates if the same consumer mounts multiple subtrees.
  slot: { mountedChildren: number; ownerLabels: string[] };
  settlement: { mountedChildren: number; ownerLabels: string[] };
  transient: { mountedChildren: number; ownerLabels: string[] };
}

export type TimerBlockedReason =
  | 'no_round'
  | 'horses_state_missing'
  | 'game_phase_not_playing'
  | 'no_current_turn_player'
  | 'bot_turn'
  | 'turn_deadline_null'
  | 'time_left_null'
  | 'timer_not_published'
  | 'deadline_expired'
  | 'ok';

export interface TimerDbgEntry {
  gameType: string | null;
  roundId: string | null;
  roundStatus: string | null;
  gamePhase: string | null;
  diceGameplayUiActive: boolean;
  horsesControllerEnabled: boolean;
  horsesStateExists: boolean;
  currentTurnPlayerId: string | null;
  currentTurnPlayerIsBot: boolean | null;
  turnDeadline: string | null;
  roundDecisionDeadline: string | null;
  timeLeft: number | null;
  maxTime: number | null;
  diceTimerActive: boolean;
  timerPublished: boolean;
  timerMounted: boolean;
  timerVisible: boolean;
  blockedReason: TimerBlockedReason;
}

export const dealerDbgStore = makeStore<DealerDbgEntry>();
export const seatOwnershipStore = makeStore<SeatOwnershipEntry>();
export const dealerAffordanceStore = makeStore<DealerAffordanceEntry>();
export const overlayOwnershipStore = makeStore<OverlayOwnershipEntry>();
export const timerDbgStore = makeStore<TimerDbgEntry>();
