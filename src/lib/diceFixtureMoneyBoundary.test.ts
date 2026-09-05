import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./debugHarness/runtimeCache', () => ({
  getActiveHarnessCached: (game: string) => game === 'horses' ? 'force_tie' : 'force_no_qualify',
}));

import { createInitialHand, rollDice } from './horsesGameLogic';
import { createInitialSCCHand, rollSCCDice } from './sccGameLogic';

afterEach(() => vi.restoreAllMocks());

describe('dice fixtures require explicit fake-money context', () => {
  it.each([true, undefined])('keeps ordinary dice when realMoney is %s', (realMoney) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(rollDice(createInitialHand(), realMoney).dice.map(d => d.value)).toEqual([6, 6, 6, 6, 6]);
    expect(rollSCCDice(createInitialSCCHand(), realMoney).hasShip).toBe(true);
  });

  it('preserves Horses tie and SCC no-qualify fixtures for fake money', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(rollDice(createInitialHand(), false).dice.map(d => d.value)).toEqual([1, 1, 1, 1, 1]);
    const scc = rollSCCDice(createInitialSCCHand(), false);
    expect(scc.dice.map(d => d.value)).toEqual([3, 3, 3, 3, 3]);
    expect(scc.hasShip).toBe(false);
  });
});
