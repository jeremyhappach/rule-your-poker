// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  getDealerSelectionReceiptKey,
  type DealerSelectionState,
} from './useHighCardDealerSelection';

const completeState = (): DealerSelectionState => ({
  cards: [
    {
      playerId: '00000000-0000-0000-0000-000000000001',
      position: 1,
      card: { rank: 'K', suit: 'clubs' },
      isRevealed: true,
      isWinner: true,
      isDimmed: false,
      roundNumber: 1,
    },
  ],
  announcement: 'Dealer selected',
  isComplete: true,
  winnerPosition: 1,
  preparedAt: '2026-08-16T17:20:20.435Z',
});

describe('getDealerSelectionReceiptKey', () => {
  it('deduplicates semantically identical realtime and refetch snapshots', () => {
    expect(getDealerSelectionReceiptKey(completeState())).toBe(
      getDealerSelectionReceiptKey(structuredClone(completeState())),
    );
  });

  it('accepts a new prepared dealer-selection identity', () => {
    const next = completeState();
    next.preparedAt = '2026-08-16T17:21:20.435Z';

    expect(getDealerSelectionReceiptKey(next)).not.toBe(
      getDealerSelectionReceiptKey(completeState()),
    );
  });
});
