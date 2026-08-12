import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from './ChipPresentationLedger';
import {
  buildHolmShowdownPresentationKey,
  buildHolmChuckyLossPresentationKey,
  canPresentHolmChuckyLossTransport,
  classifyHolmTransferPresentationStage,
} from './holmTransferPresentationStage';

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

describe('buildHolmShowdownPresentationKey', () => {
  it('does not collapse identical results from consecutive Holm hands', () => {
    const firstHand = buildHolmShowdownPresentationKey({
      dealerGameId: 'dealer-game',
      roundId: 'round-hand-1',
      handNumber: 1,
      transferCursor: 11,
    });
    const secondHand = buildHolmShowdownPresentationKey({
      dealerGameId: 'dealer-game',
      roundId: 'round-hand-2',
      handNumber: 2,
      transferCursor: 13,
    });

    expect(secondHand).not.toBe(firstHand);
  });

  it('still dedupes repeated delivery of the exact same settlement', () => {
    const identity = {
      dealerGameId: 'dealer-game',
      roundId: 'round-hand-2',
      handNumber: 2,
      transferCursor: 13,
    };

    expect(buildHolmShowdownPresentationKey(identity))
      .toBe(buildHolmShowdownPresentationKey(identity));
  });
});

describe('canPresentHolmChuckyLossTransport', () => {
  const firstLoss = buildHolmChuckyLossPresentationKey({
    handContextId: 'dealer-game#hand-1',
    triggerId: 'chucky-loss-1',
  });

  it('holds the loss until that exact result announcement has painted', () => {
    expect(canPresentHolmChuckyLossTransport({
      chuckyVisualRevealComplete: true,
      lossPresentationKey: firstLoss,
      announcementPaintedKey: null,
    })).toBe(false);

    expect(canPresentHolmChuckyLossTransport({
      chuckyVisualRevealComplete: true,
      lossPresentationKey: firstLoss,
      announcementPaintedKey: buildHolmChuckyLossPresentationKey({
        handContextId: 'dealer-game#hand-2',
        triggerId: 'chucky-loss-2',
      }),
    })).toBe(false);

    expect(canPresentHolmChuckyLossTransport({
      chuckyVisualRevealComplete: true,
      lossPresentationKey: firstLoss,
      announcementPaintedKey: firstLoss,
    })).toBe(true);
  });

  it('does not admit a loss before the Chucky reveal completes', () => {
    expect(canPresentHolmChuckyLossTransport({
      chuckyVisualRevealComplete: false,
      lossPresentationKey: firstLoss,
      announcementPaintedKey: firstLoss,
    })).toBe(false);
  });
});
