import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from './ChipPresentationLedger';
import { classifyHolmTransferPresentationStage } from './holmTransferPresentationStage';

const baseBatch = (overrides: Partial<ChipPresentationBatch>): ChipPresentationBatch => ({
  id: 'batch',
  game_id: 'game',
  cursor: 1,
  reason: 'transfer',
  transfers: [],
  opening_balances: {},
  closing_balances: {},
  ...overrides,
});

const context = {
  showdownWinnerIds: ['winner-a', 'winner-b'],
  showdownLoserIds: ['loser-a'],
  showdownMatchAmount: 6,
  chuckyLossPlayerIds: ['chucky-loser'],
  chuckyLossAmount: 3,
};

describe('classifyHolmTransferPresentationStage', () => {
  it('recognizes a multi-winner pot award from immutable topology', () => {
    expect(classifyHolmTransferPresentationStage(baseBatch({
      reason: 'win',
      transfers: [
        { id: '1', amount: 3, from: { kind: 'pot' }, to: { kind: 'player', playerId: 'winner-a' } },
        { id: '2', amount: 3, from: { kind: 'pot' }, to: { kind: 'player', playerId: 'winner-b' } },
      ],
    }), context)).toBe('showdown-pot-award');
  });

  it('recognizes only the exact loser cohort as a replacement-pot stage', () => {
    expect(classifyHolmTransferPresentationStage(baseBatch({
      transfers: [
        { id: '1', amount: 6, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    }), context)).toBe('showdown-replacement-pot');

    expect(classifyHolmTransferPresentationStage(baseBatch({
      transfers: [
        { id: '1', amount: 3, from: { kind: 'player', playerId: 'unrelated-ante' }, to: { kind: 'pot' } },
      ],
    }), context)).toBeNull();
  });

  it('does not classify a correctly labeled initial ante as terminal movement', () => {
    expect(classifyHolmTransferPresentationStage(baseBatch({
      reason: 'ante',
      transfers: [
        { id: '1', amount: 3, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    }), context)).toBeNull();
  });
});
