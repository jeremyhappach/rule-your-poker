/**
 * Canonical Card Transport — public types.
 *
 * Mirrors ChipTransport ownership model:
 *   - Shell owns: launch, travel, arrival, destroy, settle barrier.
 *   - Games own:  deal order, card identity, card visibility, source authority.
 *
 * Source authority:
 *   Cards do NOT originate from a visible deck. They originate from the
 *   player who currently holds dealing authority (dealer button, caller,
 *   etc.). Games choose the source endpoint per their rules; the shell
 *   only resolves geometry via `[data-card-anchor]` (with chip-center
 *   fallback for `seat` endpoints — see cardEndpoints.ts).
 *
 * Visibility rule (Wave 1):
 *   A real card with id `cardId` is visible iff `cardId ∈ settledCardIds`
 *   for the current `handContextId`. The flying transport node is
 *   destroyed on arrival; the destination consumer renders the real card.
 */

export type CardEndpoint =
  | { kind: 'dealer'; playerId: string }
  | { kind: 'seat'; position: number }
  | { kind: 'oppStack'; position: number }
  | { kind: 'hand'; playerId: string }
  | { kind: 'community'; index: number }
  | { kind: 'chucky'; index: number }
  | { kind: 'stock' }
  | { kind: 'discard' }
  /**
   * Canonical bottom-center felt deal origin — a static anchor mounted
   * inside the canonical felt surface directly in front of the local
   * viewer. Used as the SOURCE for every flight when the local viewer
   * is the active dealer, so cards never originate from an ActivePlayer
   * HUD/pane, opponent seat/nameplate/chip, or any already-landed
   * card/cardback rect.
   */
  | { kind: 'feltDealOrigin' };

export type CardFace = 'hidden' | 'visible';

export interface CardTransportIntent {
  /** Stable unique id for this flight. */
  id: string;
  /**
   * Identity of the underlying card asset. Used by the destination
   * consumer to claim ownership on arrival and by DealRuntime to
   * mark the card as settled.
   */
  cardId: string;
  face: CardFace;
  from: CardEndpoint;
  to: CardEndpoint;
  /** Flight duration. Defaults to 110ms — zip, not dealer simulator. */
  durationMs?: number;
  /** Per-card stagger applied at dispatch time. Defaults to 0. */
  launchDelayMs?: number;
  /** Delay after arrival before the destination claims ownership. Defaults to global Deal Timing. */
  ownershipClaimDelayMs?: number;
  /** Debug proof metadata stamped at emit time from the authoritative deal timing source. */
  timingSource?: 'GeometryLab' | 'inspectMode' | string;
  dealTimingSettings?: {
    launchSpacingMs: number;
    durationMs: number;
    ownershipClaimDelayMs: number;
    effectiveLaunchSpacingMs: number;
    effectiveDurationMs: number;
  };
  /** Store snapshot read by the game at the exact moment intents are created. */
  dealTimingStoreSnapshot?: {
    launchSpacingMs: number;
    durationMs: number;
    ownershipClaimDelayMs: number;
    updatedAt: string;
    dbUpdatedAt: string | null;
    storeVersion: number;
    source: string;
    hydrated: boolean;
  };
  /** Exact branch that produced launchDelayMs = cardIndex * this value. */
  intentTimingSource?: 'GeometryLab' | 'inspectionMode' | 'fallback' | 'hardcoded';
  /** Source annotation for launchDelayMs, e.g. `idx * store.launchSpacingMs`. */
  launchDelayFormula?: string;
  expectedStartTime?: number;
  expectedArrivalTime?: number;
  /**
   * Optional — stamped onto the dbg entry so each flight is traceable
   * to its hand without joining tables in the console.
   */
  handContextId?: string;
  /**
   * Optional — Holm-only generation fence. Paired with `handContextId`,
   * it lets DealRuntime / MobileGameTable reject stale settle callbacks
   * after `runNewHandInit` has incremented the generation, even when
   * the handContextId itself has not yet changed. Non-Holm games leave
   * this undefined.
   */
  handGeneration?: number;
  /**
   * Optional — recipient seat owner. Surfaces in DealRuntime as a
   * per-player settled count so destinations can clip their visible
   * cards by "how many of MY intents have already settled" during
   * DEALING. The runtime never reads this for movement; it's metadata.
   */
  recipientPlayerId?: string;
  /**
   * Optional — cardback styling for `face: 'hidden'` flights. When
   * present, the transport renders the flying cardback using these
   * canonical colors instead of the runtime default. Games should
   * source these from `useVisualPreferences().getCardBackColors()`.
   */
  cardBackColors?: { color: string; darkColor: string };
  /** Optional smoke metadata for dealer-origin audits. */
  dealerIsSelf?: boolean;
  /**
   * Optional — when `face: 'visible'`, render the flying card with this
   * concrete rank/suit so the in-flight asset matches the canonical
   * face-up styling instead of a plain rectangle. Games stamp this from
   * authoritative state at dispatch time.
   */
  visibleFace?: { rank: string; suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' };
}

export type DealPhase = 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY';

export function describeCardEndpoint(ep: CardEndpoint): string {
  switch (ep.kind) {
    case 'dealer':         return `dealer:${ep.playerId}`;
    case 'seat':           return `seat:${ep.position}`;
    case 'oppStack':       return `opp-stack:${ep.position}`;
    case 'hand':           return `hand:${ep.playerId}`;
    case 'community':      return `community:${ep.index}`;
    case 'chucky':         return `chucky:${ep.index}`;
    case 'stock':          return 'stock';
    case 'discard':        return 'discard';
    case 'feltDealOrigin': return 'felt-deal-origin';
  }
}
