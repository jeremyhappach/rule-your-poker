import type {
  DealerSelectionCard,
  DealerSelectionState,
} from '@/hooks/useHighCardDealerSelection';

export const SESSION_DEALER_DRAW_RECEIPT_DWELL_MS = 2200;
export const SESSION_DEALER_DRAW_TIE_WAVE_DWELL_MS = 1200;

export interface SessionDealerDrawPresentationReceipt {
  key: string;
  state: DealerSelectionState;
}

export interface SessionDealerDrawPresentationFrame {
  key: string;
  receiptKey: string;
  state: DealerSelectionState;
  roundNumber: number;
  isFinal: boolean;
}

export interface SessionDealerDrawPresentationAdvance {
  nextFrameIndex: number;
  receiptComplete: boolean;
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
  preparedAt,
}: Pick<DealerSelectionState, 'cards' | 'winnerPosition' | 'preparedAt'>): string | null {
  if (!cards.length) return null;
  return [
    `prepared:${preparedAt ?? 'legacy'}`,
    cards.map(cardKey).join('|'),
    `winner:${winnerPosition ?? 'none'}`,
  ].join('|');
}

/**
 * PostgreSQL resolves every tie round atomically and stores one completed
 * receipt. Presentation must still drain that durable result in round order;
 * rendering the full array directly collapses a tie into four simultaneous
 * cards. Frames are cumulative so the original tied cards remain on the felt
 * while the tie-break cards are added.
 */
export function deriveSessionDealerDrawPresentationFrames(
  state: DealerSelectionState | null | undefined,
): SessionDealerDrawPresentationFrame[] {
  if (!state?.cards.length) return [];
  const receiptKey = getSessionDealerDrawPresentationKey(state);
  if (!receiptKey) return [];

  const roundNumbers = Array.from(new Set(
    state.cards
      .map((card) => card.roundNumber)
      .filter((roundNumber) => Number.isFinite(roundNumber)),
  )).sort((left, right) => left - right);
  const normalizedRounds = roundNumbers.length > 0 ? roundNumbers : [1];

  return normalizedRounds.map((roundNumber, index) => {
    const isFinal = index === normalizedRounds.length - 1;
    return {
      key: `${receiptKey}|wave:${roundNumber}`,
      receiptKey,
      roundNumber,
      isFinal,
      state: isFinal
        ? state
        : {
            ...state,
            cards: state.cards.filter((card) => card.roundNumber <= roundNumber),
            announcement: 'Tie! Drawing again...',
            isComplete: false,
            winnerPosition: null,
          },
    };
  });
}

export function getSessionDealerDrawPresentationFrameDwellMs(
  frame: SessionDealerDrawPresentationFrame,
): number {
  return frame.isFinal
    ? SESSION_DEALER_DRAW_RECEIPT_DWELL_MS
    : SESSION_DEALER_DRAW_TIE_WAVE_DWELL_MS;
}

/** Reject stale/duplicate DOM acknowledgements and advance one exact wave. */
export function advanceSessionDealerDrawPresentationFrame({
  frames,
  frameIndex,
  visibleFrameKey,
}: {
  frames: readonly SessionDealerDrawPresentationFrame[];
  frameIndex: number;
  visibleFrameKey: string;
}): SessionDealerDrawPresentationAdvance | null {
  const frame = frames[frameIndex];
  if (!frame || frame.key !== visibleFrameKey) return null;
  return frame.isFinal
    ? { nextFrameIndex: frameIndex, receiptComplete: true }
    : { nextFrameIndex: frameIndex + 1, receiptComplete: false };
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
  completedReceiptKeys,
}: {
  previousStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  incomingState: DealerSelectionState | null | undefined;
  completedReceiptKeys: ReadonlySet<string>;
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
  if (!key || completedReceiptKeys.has(key)) return null;
  return { key, state: incomingState };
}
