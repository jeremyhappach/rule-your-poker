import { describe, expect, it } from 'vitest';

import type { DealerSelectionState } from '@/hooks/useHighCardDealerSelection';
import {
  deriveSessionDealerDrawPresentationReceipt,
  getSessionDealerDrawPresentationKey,
} from './sessionDealerDrawPresentation';

const completedState: DealerSelectionState = {
  cards: [
    {
      playerId: 'player-1',
      position: 1,
      card: { rank: 'K', suit: 'hearts' },
      isRevealed: true,
      isWinner: true,
      isDimmed: false,
      roundNumber: 1,
    },
    {
      playerId: 'player-2',
      position: 2,
      card: { rank: '9', suit: 'clubs' },
      isRevealed: true,
      isWinner: false,
      isDimmed: true,
      roundNumber: 1,
    },
  ],
  announcement: 'Player 1 is the dealer',
  isComplete: true,
  winnerPosition: 1,
  preparedAt: '2026-08-24T17:13:05.000Z',
};

describe('session dealer-draw presentation receipt', () => {
  it('holds an unseen completed draw across the status transition that would unmount it', () => {
    const receipt = deriveSessionDealerDrawPresentationReceipt({
      previousStatus: 'dealer_selection',
      nextStatus: 'game_selection',
      incomingState: completedState,
      visibleReceiptKeys: new Set(),
    });

    expect(receipt?.state).toBe(completedState);
    expect(receipt?.key).toBe(getSessionDealerDrawPresentationKey(completedState));
  });

  it('does not replay an exact draw that reached the real felt renderer', () => {
    const key = getSessionDealerDrawPresentationKey(completedState)!;
    expect(deriveSessionDealerDrawPresentationReceipt({
      previousStatus: 'dealer_selection',
      nextStatus: 'game_selection',
      incomingState: completedState,
      visibleReceiptKeys: new Set([key]),
    })).toBeNull();
  });

  it('never replays a stale completed receipt on a cold later mount', () => {
    expect(deriveSessionDealerDrawPresentationReceipt({
      previousStatus: null,
      nextStatus: 'game_selection',
      incomingState: completedState,
      visibleReceiptKeys: new Set(),
    })).toBeNull();
  });

  it('does not hold an incomplete draw', () => {
    expect(deriveSessionDealerDrawPresentationReceipt({
      previousStatus: 'dealer_selection',
      nextStatus: 'game_selection',
      incomingState: { ...completedState, isComplete: false, winnerPosition: null },
      visibleReceiptKeys: new Set(),
    })).toBeNull();
  });
});
