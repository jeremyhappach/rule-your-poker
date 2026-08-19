import { describe, expect, it } from 'vitest';
import { selectTransferableThreeFiveSevenLegs } from './legsToPlayerPresentation';

describe('3-5-7 legs-to-player presentation', () => {
  it('returns no transfer work when only the winner has legs', () => {
    expect(selectTransferableThreeFiveSevenLegs([
      { playerId: 'winner', position: 3, legCount: 2 },
    ], 3, 3)).toEqual([]);
  });

  it('preserves only opponent legs that can visibly move to the winner', () => {
    expect(selectTransferableThreeFiveSevenLegs([
      { playerId: 'winner', position: 3, legCount: 2 },
      { playerId: 'opponent-a', position: 5, legCount: 1 },
      { playerId: 'opponent-b', position: 7, legCount: 5 },
      { playerId: 'opponent-c', position: 9, legCount: 0 },
    ], 3, 3)).toEqual([
      { playerId: 'opponent-a', position: 5, legCount: 1 },
      { playerId: 'opponent-b', position: 7, legCount: 3 },
    ]);
  });
});
