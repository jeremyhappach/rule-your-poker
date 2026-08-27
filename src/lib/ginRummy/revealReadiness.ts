import type { GinRummyCard, GinRummyState } from '@/lib/ginRummyTypes';

export function isGinCardFaceKnown(card: GinRummyCard): boolean {
  const projected = card as GinRummyCard & { masked?: boolean };
  return projected.masked !== true
    && card.rank !== '?'
    && (card.suit as string) !== '?';
}

export function isGinOpponentRevealReady(
  state: GinRummyState,
  currentPlayerId: string | undefined,
): boolean {
  if (!currentPlayerId) return false;
  const otherPlayerId = currentPlayerId === state.dealerPlayerId
    ? state.nonDealerPlayerId
    : state.dealerPlayerId;
  const otherState = state.playerStates[otherPlayerId];
  if (!otherState) return false;

  const visibleCards = [
    ...otherState.melds.flatMap((meld) => meld.cards),
    ...otherState.deadwood,
    ...otherState.hand,
  ];
  return visibleCards.length > 0 && visibleCards.every(isGinCardFaceKnown);
}
