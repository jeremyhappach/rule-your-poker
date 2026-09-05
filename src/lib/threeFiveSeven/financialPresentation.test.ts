import { describe, expect, it } from 'vitest';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import {
  getThreeFiveSevenPlayerToPotAdmission,
  retainThreeFiveSevenFinancialPresentation,
} from './financialPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

const allFold: ThreeFiveSevenAllFoldPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h2-r3',
  handNumber: 2,
  roundNumber: 3,
  transferCursor: 8,
};

const reAnte: ThreeFiveSevenRolloverPresentation = {
  openingTransferRequired: true,
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h3-r1',
  handNumber: 3,
  roundNumber: 1,
  transferCursor: 9,
};

const playerToPotBatch = (
  cursor: number,
  reason: 'bet' | 'ante',
): Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'> => ({
  cursor,
  reason,
  transfers: [{
    id: `batch-${cursor}:1`,
    amount: 1,
    from: { kind: 'player', playerId: 'player-1' },
    to: { kind: 'pot' },
  }],
});

const scope = { gameId: 'game-1', dealerGameId: 'dealer-1' };

describe('3-5-7 financial presentation claims', () => {
  it('keeps a slow client\'s outgoing tax cursor after a peer publishes the successor hand', () => {
    const capturedTax = retainThreeFiveSevenFinancialPresentation(null, allFold, scope);
    const afterSuccessorAuthority = retainThreeFiveSevenFinancialPresentation(
      capturedTax,
      null,
      scope,
    );

    expect(afterSuccessorAuthority).toEqual(allFold);
    expect(getThreeFiveSevenPlayerToPotAdmission(
      playerToPotBatch(8, 'bet'),
      afterSuccessorAuthority,
      reAnte,
    )).toBe(true);
    expect(getThreeFiveSevenPlayerToPotAdmission(
      playerToPotBatch(9, 'ante'),
      afterSuccessorAuthority,
      reAnte,
    )).toBe(true);
  });

  it('does not let either financial claim authorize the other cursor', () => {
    expect(getThreeFiveSevenPlayerToPotAdmission(
      playerToPotBatch(9, 'bet'),
      allFold,
      reAnte,
    )).toBe(false);
    expect(getThreeFiveSevenPlayerToPotAdmission(
      playerToPotBatch(8, 'ante'),
      allFold,
      reAnte,
    )).toBe(false);
  });

  it('replaces a retained claim monotonically and clears it at a dealer-game boundary', () => {
    const newerTax = { ...allFold, roundId: 'round-h3-r1', transferCursor: 10 };
    expect(retainThreeFiveSevenFinancialPresentation(allFold, newerTax, scope)).toEqual(newerTax);
    expect(retainThreeFiveSevenFinancialPresentation(newerTax, allFold, scope)).toEqual(newerTax);
    expect(retainThreeFiveSevenFinancialPresentation(newerTax, null, {
      gameId: 'game-1',
      dealerGameId: 'dealer-2',
    })).toBeNull();
  });

  it('leaves unrelated financial batches to their existing presentation owner', () => {
    expect(getThreeFiveSevenPlayerToPotAdmission({
      ...playerToPotBatch(10, 'bet'),
      reason: 'win',
    }, allFold, reAnte)).toBeNull();
    expect(getThreeFiveSevenPlayerToPotAdmission({
      cursor: 10,
      reason: 'transfer',
      transfers: [{
        id: 'player-to-player',
        amount: 2,
        from: { kind: 'player', playerId: 'player-1' },
        to: { kind: 'player', playerId: 'player-2' },
      }],
    }, allFold, reAnte)).toBeNull();
  });
});
