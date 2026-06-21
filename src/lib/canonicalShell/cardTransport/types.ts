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
  | { kind: 'hand'; playerId: string }
  | { kind: 'stock' }
  | { kind: 'discard' };

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
  /**
   * Optional — stamped onto the dbg entry so each flight is traceable
   * to its hand without joining tables in the console.
   */
  handContextId?: string;
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
}

export type DealPhase = 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY';

export function describeCardEndpoint(ep: CardEndpoint): string {
  switch (ep.kind) {
    case 'dealer':  return `dealer:${ep.playerId}`;
    case 'seat':    return `seat:${ep.position}`;
    case 'hand':    return `hand:${ep.playerId}`;
    case 'stock':   return 'stock';
    case 'discard': return 'discard';
  }
}
