import { describe, expect, it } from 'vitest';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';
import {
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

describe('3-5-7 exact announcement ownership', () => {
  it.each(['queued', 'running'] as const)(
    'shows Pussy Tax while its exact transfer is %s',
    (cursorState) => {
      expect(getThreeFiveSevenPussyTaxAnnouncement(allFold, cursorState)).toMatchObject({
        text: 'Pussy Tax!',
      });
    },
  );

  it.each(['unknown', 'settled', 'reconciling', 'reconciled'] as const)(
    'does not publish Pussy Tax when its cursor is %s',
    (cursorState) => {
      expect(getThreeFiveSevenPussyTaxAnnouncement(allFold, cursorState)).toBeNull();
    },
  );

  it('does not claim a tax announcement when no tax transfer committed', () => {
    expect(getThreeFiveSevenPussyTaxAnnouncement(
      { ...allFold, transferCursor: null },
      'queued',
    )).toBeNull();
  });

  it('admits a narrated transfer only for its exact committed cursor', () => {
    expect(matchesThreeFiveSevenPresentationCursor(allFold, 8)).toBe(true);
    expect(matchesThreeFiveSevenPresentationCursor(allFold, 9)).toBe(false);
    expect(matchesThreeFiveSevenPresentationCursor(reAnte, 9)).toBe(true);
    expect(matchesThreeFiveSevenPresentationCursor(reAnte, 8)).toBe(false);
  });

  it.each(['queued', 'running'] as const)(
    'shows Re-Ante while the exact later-hand Round 1 transfer is %s',
    (cursorState) => {
      expect(getThreeFiveSevenReAnteAnnouncement(reAnte, cursorState)).toMatchObject({
        text: 'Re-Ante',
      });
    },
  );

  it('never calls the opening H1/R1 ante a re-ante', () => {
    expect(getThreeFiveSevenReAnteAnnouncement(
      { ...reAnte, handNumber: 1, roundId: 'round-h1-r1' },
      'running',
    )).toBeNull();
  });

  it.each(['settled', 'reconciled'] as const)(
    'retires Re-Ante at the exact terminal cursor state %s',
    (cursorState) => {
      expect(getThreeFiveSevenReAnteAnnouncement(reAnte, cursorState)).toBeNull();
    },
  );

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
