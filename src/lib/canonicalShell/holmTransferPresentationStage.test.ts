import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from './ChipPresentationLedger';
import {
  buildHolmShowdownPresentationKey,
  buildHolmChuckyLossPresentationKey,
  canAdmitHolmTransferPresentation,
  canPresentHolmChuckyLossTransport,
  classifyHolmTransferPresentationStage,
  isUnclassifiedHolmPlayerToPotTransfer,
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
  pussyTaxPlayerIds: ['winner-a', 'winner-b', 'loser-a'],
  pussyTaxAmount: 1,
};

const admissionState = (overrides: Partial<Parameters<typeof canAdmitHolmTransferPresentation>[1]> = {}) => ({
  ...context,
  communityFullyRevealed: false,
  chuckyVisualRevealComplete: false,
  chuckyLossTransportPresentationReady: false,
  winPotPresentationReady: false,
  showdownPhase: 'idle' as const,
  pussyTaxPresentationReady: false,
  ...overrides,
});

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

  it('recognizes the exact all-player pussy-tax cohort', () => {
    expect(classifyHolmTransferPresentationStage(baseBatch({
      transfers: [
        { id: '1', amount: 1, from: { kind: 'player', playerId: 'winner-a' }, to: { kind: 'pot' } },
        { id: '2', amount: 1, from: { kind: 'player', playerId: 'winner-b' }, to: { kind: 'pot' } },
        { id: '3', amount: 1, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    }), context)).toBe('pussy-tax');
  });
});

describe('isUnclassifiedHolmPlayerToPotTransfer', () => {
  const terminalContribution = baseBatch({
    transfers: [
      { id: '1', amount: 8, from: { kind: 'player', playerId: 'loser' }, to: { kind: 'pot' } },
    ],
  });

  it('fails closed when the batch arrives before its result context', () => {
    expect(isUnclassifiedHolmPlayerToPotTransfer(terminalContribution, null)).toBe(true);
  });

  it('releases once the exact terminal stage is known', () => {
    expect(isUnclassifiedHolmPlayerToPotTransfer(terminalContribution, 'chucky-loss')).toBe(false);
    expect(isUnclassifiedHolmPlayerToPotTransfer(terminalContribution, 'showdown-replacement-pot')).toBe(false);
    expect(isUnclassifiedHolmPlayerToPotTransfer(terminalContribution, 'pussy-tax')).toBe(false);
  });

  it('never holds an immutable ante batch', () => {
    expect(isUnclassifiedHolmPlayerToPotTransfer({
      ...terminalContribution,
      reason: 'ante',
    }, null)).toBe(false);
  });
});

describe('canAdmitHolmTransferPresentation', () => {
  const playerToPot = baseBatch({
    transfers: [
      { id: '1', amount: 8, from: { kind: 'player', playerId: 'late-context-loser' }, to: { kind: 'pot' } },
    ],
  });

  it('holds the production batch-first/result-second ordering', () => {
    expect(canAdmitHolmTransferPresentation(playerToPot, admissionState())).toBe(false);
  });

  it('holds an exact Chucky loss until its reveal and announcement gate opens', () => {
    const loss = baseBatch({
      transfers: [
        { id: '1', amount: 3, from: { kind: 'player', playerId: 'chucky-loser' }, to: { kind: 'pot' } },
      ],
    });

    expect(canAdmitHolmTransferPresentation(loss, admissionState())).toBe(false);
    expect(canAdmitHolmTransferPresentation(loss, admissionState({
      chuckyLossTransportPresentationReady: true,
    }))).toBe(true);
  });

  it('preserves ordered multi-player replacement-pot and pussy-tax stages', () => {
    const replacementPot = baseBatch({
      transfers: [
        { id: '1', amount: 6, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    });
    expect(canAdmitHolmTransferPresentation(replacementPot, admissionState())).toBe(false);
    expect(canAdmitHolmTransferPresentation(replacementPot, admissionState({
      showdownPhase: 'losers-to-pot',
    }))).toBe(true);

    const pussyTax = baseBatch({
      transfers: [
        { id: '1', amount: 1, from: { kind: 'player', playerId: 'winner-a' }, to: { kind: 'pot' } },
        { id: '2', amount: 1, from: { kind: 'player', playerId: 'winner-b' }, to: { kind: 'pot' } },
        { id: '3', amount: 1, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    });
    expect(canAdmitHolmTransferPresentation(pussyTax, admissionState())).toBe(false);
    expect(canAdmitHolmTransferPresentation(pussyTax, admissionState({
      pussyTaxPresentationReady: true,
    }))).toBe(true);
  });

  it('still admits an immutable ante without terminal context', () => {
    expect(canAdmitHolmTransferPresentation(baseBatch({
      reason: 'ante',
      transfers: [
        { id: '1', amount: 3, from: { kind: 'player', playerId: 'winner-a' }, to: { kind: 'pot' } },
      ],
    }), admissionState())).toBe(true);
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
