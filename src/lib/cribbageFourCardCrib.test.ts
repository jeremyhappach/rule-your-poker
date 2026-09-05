// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { advanceCribbageToCutting, discardToCrib, initializeCribbageGame } from './cribbageGameLogic';

describe('four-card crib', () => {
  for (const count of [2, 3, 4]) {
    it(`preserves a unique four-card crib and separate starter for ${count} players`, () => {
      const ids = Array.from({ length: count }, (_, i) => `player-${i}`);
      let state = initializeCribbageGame(ids, ids[0], 1);
      for (const id of ids) state = discardToCrib(state, id, count === 2 ? [0, 1] : [0]);
      expect(state.crib).toHaveLength(4);
      const all = [...Object.values(state.playerStates).flatMap(p => p.hand), ...state.crib, state.cutCard!];
      expect(new Set(all.map(c => `${c.rank}:${c.suit}`)).size).toBe(count * 4 + 5);
      expect(advanceCribbageToCutting(state)).toBe(state);
    });
  }
});
