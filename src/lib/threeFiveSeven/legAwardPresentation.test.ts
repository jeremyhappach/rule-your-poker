import { describe, expect, it } from 'vitest';
import {
  getThreeFiveSevenLegAwardPresentationKey,
  isThreeFiveSevenOrdinaryLegAwardResult,
} from './legAwardPresentation';

describe('3-5-7 ordinary leg award presentation', () => {
  it.each([
    'Hap won a leg',
    'Hap stayed alone and earned leg 2',
    'Hap stayed alone and won leg 2',
  ])('recognizes the authoritative ordinary leg result %s', (result) => {
    expect(isThreeFiveSevenOrdinaryLegAwardResult(result)).toBe(true);
  });

  it('does not take over all-fold, tie, or terminal results', () => {
    expect(isThreeFiveSevenOrdinaryLegAwardResult('All players folded')).toBe(false);
    expect(isThreeFiveSevenOrdinaryLegAwardResult('Tie: pot carries forward')).toBe(false);
    expect(isThreeFiveSevenOrdinaryLegAwardResult('🏆 Hap won the game!')).toBe(false);
  });

  it('keys acknowledgements to the exact player-leg result generation', () => {
    expect(getThreeFiveSevenLegAwardPresentationKey({
      gameId: 'game-1',
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
      handNumber: 2,
      roundNumber: 3,
      playerId: 'player-1',
      legNumber: 2,
    })).toBe('game-1|dealer-1|round-1|2|3|player-1|2');
  });
});
