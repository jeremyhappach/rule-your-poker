import { describe, expect, it } from 'vitest';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  getThreeFiveSevenBatchStartAnnouncement,
  getThreeFiveSevenPussyTaxAnnouncement,
  getThreeFiveSevenReAnteAnnouncement,
  isThreeFiveSevenDedicatedResultAnnouncement,
  matchesThreeFiveSevenPresentationCursor,
} from './announcementPresentation';

const allFold: ThreeFiveSevenAllFoldPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h1-r3',
  handNumber: 1,
  roundNumber: 3,
  transferCursor: 8,
};

const reAnte: ThreeFiveSevenRolloverPresentation = {
  gameId: 'game-1',
  dealerGameId: 'dealer-1',
  roundId: 'round-h2-r1',
  handNumber: 2,
  roundNumber: 1,
  transferCursor: 9,
};

function playerToPotBatch(
  cursor: number,
  reason: ChipPresentationBatch['reason'],
): Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'> {
  return {
    cursor,
    reason,
    transfers: [{
      id: `transfer-${cursor}`,
      amount: 1,
      from: { kind: 'player', playerId: 'player-1' },
      to: { kind: 'pot' },
    }],
  };
}

describe('3-5-7 exact announcement ownership', () => {
  it('derives Pussy Tax directly from its exact committed cursor identity', () => {
    expect(getThreeFiveSevenPussyTaxAnnouncement(allFold)).toMatchObject({
      text: 'Pussy Tax!',
      kind: 'pussy_tax',
      handNumber: 1,
      transferCursor: 8,
    });
    expect(getThreeFiveSevenPussyTaxAnnouncement({
      ...allFold,
      transferCursor: null,
    })).toBeNull();
  });

  it('derives Re-Ante directly from the exact later-hand Round 1 identity', () => {
    expect(getThreeFiveSevenReAnteAnnouncement(reAnte)).toMatchObject({
      text: 'Re-Ante',
      kind: 'reante',
      handNumber: 2,
      transferCursor: 9,
    });
    expect(getThreeFiveSevenReAnteAnnouncement({
      ...reAnte,
      handNumber: 1,
      roundId: 'round-h1-r1',
    })).toBeNull();
  });

  it('classifies the exact animated Pussy Tax batch for settlement retirement', () => {
    expect(getThreeFiveSevenBatchStartAnnouncement(
      playerToPotBatch(8, 'bet'),
      allFold,
      reAnte,
    )).toMatchObject({
      text: 'Pussy Tax!',
      kind: 'pussy_tax',
    });
  });

  it.each([
    [playerToPotBatch(7, 'bet'), allFold],
    [playerToPotBatch(8, 'ante'), allFold],
    [playerToPotBatch(8, 'bet'), { ...allFold, transferCursor: null }],
  ] as const)('does not narrate a non-matching tax batch %#', (batch, presentation) => {
    expect(getThreeFiveSevenBatchStartAnnouncement(batch, presentation, reAnte)).toBeNull();
  });

  it('admits a narrated transfer only for its exact committed cursor', () => {
    expect(matchesThreeFiveSevenPresentationCursor(allFold, 8)).toBe(true);
    expect(matchesThreeFiveSevenPresentationCursor(allFold, 9)).toBe(false);
    expect(matchesThreeFiveSevenPresentationCursor(reAnte, 9)).toBe(true);
    expect(matchesThreeFiveSevenPresentationCursor(reAnte, 8)).toBe(false);
  });

  it('classifies the exact animated Re-Ante batch for settlement retirement', () => {
    expect(getThreeFiveSevenBatchStartAnnouncement(
      playerToPotBatch(9, 'ante'),
      allFold,
      reAnte,
    )).toMatchObject({
      text: 'Re-Ante',
      kind: 'reante',
    });
  });

  it('requires player-to-pot motion at the exact launch boundary', () => {
    expect(getThreeFiveSevenBatchStartAnnouncement(
      { ...playerToPotBatch(9, 'ante'), transfers: [] },
      allFold,
      reAnte,
    )).toBeNull();
  });

  it('never calls the opening H1/R1 ante a re-ante', () => {
    expect(getThreeFiveSevenBatchStartAnnouncement(
      playerToPotBatch(9, 'ante'),
      allFold,
      { ...reAnte, handNumber: 1, roundId: 'round-h1-r1' },
    )).toBeNull();
  });

  it('classifies the serialized tax and re-ante starts independently', () => {
    const events = [
      getThreeFiveSevenBatchStartAnnouncement(playerToPotBatch(8, 'bet'), allFold, reAnte),
      getThreeFiveSevenBatchStartAnnouncement(playerToPotBatch(9, 'ante'), allFold, reAnte),
    ];
    expect(events.map((event) => event?.kind)).toEqual(['pussy_tax', 'reante']);
  });

  it.each([
    'All players folded',
    'Hap won a leg',
    'Hap stayed alone and earned leg 2',
    'Hap stayed alone and won leg 2',
  ])('keeps generic result narration from competing with %s', (result) => {
    expect(isThreeFiveSevenDedicatedResultAnnouncement(result)).toBe(true);
  });

  it('leaves showdown narration with the generic result owner', () => {
    expect(isThreeFiveSevenDedicatedResultAnnouncement(
      'Hap won showdown|||WINNER:player-1|||HANDNAME:Pair',
    )).toBe(false);
  });
});
