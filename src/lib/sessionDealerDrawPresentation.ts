import type {
  DealerSelectionCard,
  DealerSelectionState,
} from '@/hooks/useHighCardDealerSelection';

export const SESSION_DEALER_DRAW_RECEIPT_DWELL_MS = 2200;

export interface SessionDealerDrawPresentationReceipt {
  key: string;
  state: DealerSelectionState;
}

function cardKey(card: DealerSelectionCard): string {
  return [
    card.playerId,
    card.position,
    card.card.rank,
    card.card.suit,
    card.roundNumber,
    card.isRevealed ? 1 : 0,
    card.isWinner ? 1 : 0,
    card.isDimmed ? 1 : 0,
  ].join(':');
}

export function getSessionDealerDrawPresentationKey({
  cards,
  winnerPosition,
}: Pick<DealerSelectionState, 'cards' | 'winnerPosition'>): string | null {
  if (!cards.length) return null;
  return `${cards.map(cardKey).join('|')}|winner:${winnerPosition ?? 'none'}`;
}

/**
 * Preserve a completed session dealer draw that was co-published with the
 * lifecycle transition which unmounted its controller. If this exact result
 * already reached the real felt renderer, no hold is needed. Stale completed
 * receipts observed outside the dealer-selection transition never replay.
 */
export function deriveSessionDealerDrawPresentationReceipt({
  previousStatus,
  nextStatus,
  incomingState,
  visibleReceiptKeys,
}: {
  previousStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  incomingState: DealerSelectionState | null | undefined;
  visibleReceiptKeys: ReadonlySet<string>;
}): SessionDealerDrawPresentationReceipt | null {
  if (previousStatus !== 'dealer_selection' || nextStatus === 'dealer_selection') {
    return null;
  }
  if (
    !incomingState?.isComplete
    || incomingState.winnerPosition === null
    || incomingState.cards.length === 0
  ) {
    return null;
  }
  const key = getSessionDealerDrawPresentationKey(incomingState);
  if (!key || visibleReceiptKeys.has(key)) return null;
  return { key, state: incomingState };
}
