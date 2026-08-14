import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from './ChipPresentationLedger';
import {
  buildHolmChuckyLossPresentationKey,
  canAdmitHolmTransferPresentation,
  canPresentHolmChuckyLossTransport,
  classifyHolmTransferPresentationStage,
  deriveHolmChuckyLossContext,
  isHolmChuckyLossResult,
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
  presentationTransferCursor: 1,
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

  it('never lets a hidden successor borrow the presented hand result gate', () => {
    const hiddenSuccessorTax = baseBatch({
      cursor: 2,
      transfers: [
        { id: '1', amount: 1, from: { kind: 'player', playerId: 'winner-a' }, to: { kind: 'pot' } },
        { id: '2', amount: 1, from: { kind: 'player', playerId: 'winner-b' }, to: { kind: 'pot' } },
        { id: '3', amount: 1, from: { kind: 'player', playerId: 'loser-a' }, to: { kind: 'pot' } },
      ],
    });

    expect(canAdmitHolmTransferPresentation(hiddenSuccessorTax, admissionState({
      presentationTransferCursor: 1,
      pussyTaxPresentationReady: true,
    }))).toBe(false);
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

describe('Holm Chucky-loss presentation identity', () => {
  it('derives a solo loser from the stayed player UUID instead of result-copy alias lookup', () => {
    expect(deriveHolmChuckyLossContext(
      'Chucky beat a display name that is not loaded with One Pair. -$8',
      [
        { id: 'folded-player', current_decision: 'fold' },
        { id: 'authoritative-loser', current_decision: 'stay' },
      ],
    )).toEqual({ playerIds: ['authoritative-loser'], amount: 8 });
  });

  it('classifies the solo tie-and-lose copy as the same committed loss stage', () => {
    const result = 'Ya tie but ya lose! Chucky beat Player with One Pair. -$8';
    expect(isHolmChuckyLossResult(result)).toBe(true);
    expect(deriveHolmChuckyLossContext(result, [
      { id: 'authoritative-loser', current_decision: 'stay' },
    ])).toEqual({ playerIds: ['authoritative-loser'], amount: 8 });
  });

  it('derives tied losers and per-player amount from authoritative stayed UUIDs', () => {
    const result = "Tie broken by Chucky! A and B lose to Chucky's Two Pair. $12 added to pot.";
    expect(isHolmChuckyLossResult(result)).toBe(true);
    expect(deriveHolmChuckyLossContext(result, [
      { id: 'loser-a', current_decision: 'stay' },
      { id: 'loser-b', current_decision: 'stay' },
      { id: 'folded', current_decision: 'fold' },
    ])).toEqual({ playerIds: ['loser-a', 'loser-b'], amount: 6 });
  });

  it('classifies the all-tied multi-player copy as the same committed loss stage', () => {
    const result = "Ya tie but ya lose! A and B lose to Chucky's Two Pair. $12 added to pot.";
    expect(isHolmChuckyLossResult(result)).toBe(true);
    expect(deriveHolmChuckyLossContext(result, [
      { id: 'loser-a', current_decision: 'stay' },
      { id: 'loser-b', current_decision: 'stay' },
    ])).toEqual({ playerIds: ['loser-a', 'loser-b'], amount: 6 });
  });

  it('fails closed when decision UUIDs are incomplete or the total cannot divide exactly', () => {
    expect(deriveHolmChuckyLossContext(
      'Chucky beat Alias with One Pair. -$8',
      [{ id: 'a', current_decision: 'stay' }, { id: 'b', current_decision: 'stay' }],
    )).toBeNull();
    expect(deriveHolmChuckyLossContext(
      "Tie broken by Chucky! A and B lose to Chucky's Two Pair. $11 added to pot.",
      [{ id: 'a', current_decision: 'stay' }, { id: 'b', current_decision: 'stay' }],
    )).toBeNull();
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
