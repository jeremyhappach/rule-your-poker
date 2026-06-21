/**
 * Canonical Card Transport — public types.
 *
 * Mirrors ChipTransport ownership model:
 *   - Shell owns: launch, travel, arrival, destroy, settle barrier.
 *   - Games own:  deal order, card identity, card visibility.
 *
 * Visibility rule (Wave 1):
 *   A real card with id `cardId` is visible iff `cardId ∈ settledCardIds`
 *   for the current `handContextId`. The flying transport node is
 *   destroyed on arrival; the destination consumer renders the real card.
 */

export type CardEndpoint =
  | { kind: 'deck' }
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
}

export type DealPhase = 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY';

export function describeCardEndpoint(ep: CardEndpoint): string {
  switch (ep.kind) {
    case 'deck':    return 'deck';
    case 'seat':    return `seat:${ep.position}`;
    case 'hand':    return `hand:${ep.playerId}`;
    case 'stock':   return 'stock';
    case 'discard': return 'discard';
  }
}
