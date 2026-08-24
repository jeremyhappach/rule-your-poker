import { describe, expect, it } from 'vitest';

import type { DealerSelectionState } from '@/hooks/useHighCardDealerSelection';
import {
  advanceSessionDealerDrawPresentationFrame,
  deriveSessionDealerDrawPresentationFrames,
  deriveSessionDealerDrawPresentationReceipt,
  getSessionDealerDrawPresentationFrameDwellMs,
  getSessionDealerDrawPresentationKey,
  SESSION_DEALER_DRAW_RECEIPT_DWELL_MS,
  SESSION_DEALER_DRAW_TIE_WAVE_DWELL_MS,
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

const tiedState: DealerSelectionState = {
  cards: [
    {
      playerId: 'player-1',
      position: 1,
      card: { rank: '9', suit: 'hearts' },
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
      isWinner: true,
      isDimmed: false,
      roundNumber: 1,
    },
    {
      playerId: 'player-1',
      position: 1,
      card: { rank: 'K', suit: 'diamonds' },
      isRevealed: true,
      isWinner: true,
      isDimmed: false,
      roundNumber: 2,
    },
    {
      playerId: 'player-2',
      position: 2,
      card: { rank: '5', suit: 'spades' },
      isRevealed: true,
      isWinner: false,
      isDimmed: true,
      roundNumber: 2,
    },
  ],
  announcement: 'Player 1 is the dealer',
  isComplete: true,
  winnerPosition: 1,
  preparedAt: '2026-08-24T18:49:41.600Z',
};

describe('session dealer-draw presentation receipt', () => {
  it('uses the database prepared identity so a later identical draw is new', () => {
    expect(getSessionDealerDrawPresentationKey(completedState)).not.toBe(
      getSessionDealerDrawPresentationKey({
        ...completedState,
        preparedAt: '2026-08-24T18:13:05.000Z',
      }),
    );
  });

  it('drains tie cards as cumulative ordered waves', () => {
    const frames = deriveSessionDealerDrawPresentationFrames(tiedState);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ roundNumber: 1, isFinal: false });
    expect(frames[0].state.cards.map((card) => card.roundNumber)).toEqual([1, 1]);
    expect(frames[0].state).toMatchObject({ isComplete: false, winnerPosition: null });
    expect(frames[1]).toMatchObject({ roundNumber: 2, isFinal: true, state: tiedState });
    expect(frames[1].state.cards).toHaveLength(4);
    expect(frames[0].key).not.toBe(frames[1].key);
    expect(frames[0].receiptKey).toBe(frames[1].receiptKey);
  });

  it('supports more than one tie without collapsing later waves', () => {
    const thirdRound = tiedState.cards.slice(2).map((card) => ({
      ...card,
      card: { ...card.card, rank: card.position === 1 ? 'A' : 'Q' },
      roundNumber: 3,
    }));
    const frames = deriveSessionDealerDrawPresentationFrames({
      ...tiedState,
      cards: [...tiedState.cards, ...thirdRound],
    });

    expect(frames.map((frame) => frame.state.cards.length)).toEqual([2, 4, 6]);
    expect(frames.map((frame) => frame.roundNumber)).toEqual([1, 2, 3]);
  });

  it('advances only the exact painted wave and completes only after the final wave', () => {
    const frames = deriveSessionDealerDrawPresentationFrames(tiedState);
    expect(getSessionDealerDrawPresentationFrameDwellMs(frames[0])).toBe(
      SESSION_DEALER_DRAW_TIE_WAVE_DWELL_MS,
    );
    expect(advanceSessionDealerDrawPresentationFrame({
      frames,
      frameIndex: 0,
      visibleFrameKey: frames[0].key,
    })).toEqual({ nextFrameIndex: 1, receiptComplete: false });
    expect(advanceSessionDealerDrawPresentationFrame({
      frames,
      frameIndex: 1,
      visibleFrameKey: frames[1].key,
    })).toEqual({ nextFrameIndex: 1, receiptComplete: true });
    expect(getSessionDealerDrawPresentationFrameDwellMs(frames[1])).toBe(
      SESSION_DEALER_DRAW_RECEIPT_DWELL_MS,
    );
  });

  it('ignores a delayed acknowledgement from an earlier wave', () => {
    const frames = deriveSessionDealerDrawPresentationFrames(tiedState);
    expect(advanceSessionDealerDrawPresentationFrame({
      frames,
      frameIndex: 1,
      visibleFrameKey: frames[0].key,
    })).toBeNull();
  });

  it('holds an unseen completed draw across the status transition that would unmount it', () => {
    const receipt = deriveSessionDealerDrawPresentationReceipt({
      previousStatus: 'dealer_selection',
      nextStatus: 'game_selection',
      incomingState: completedState,
      completedReceiptKeys: new Set(),
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
      completedReceiptKeys: new Set([key]),
    })).toBeNull();
  });

  it('never replays a stale completed receipt on a cold later mount', () => {
    expect(deriveSessionDealerDrawPresentationReceipt({
      previousStatus: null,
      nextStatus: 'game_selection',
      incomingState: completedState,
      completedReceiptKeys: new Set(),
    })).toBeNull();
  });

  it('does not hold an incomplete draw', () => {
    expect(deriveSessionDealerDrawPresentationReceipt({
      previousStatus: 'dealer_selection',
      nextStatus: 'game_selection',
      incomingState: { ...completedState, isComplete: false, winnerPosition: null },
      completedReceiptKeys: new Set(),
    })).toBeNull();
  });
});
