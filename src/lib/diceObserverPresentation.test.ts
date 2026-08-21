import { describe, expect, it } from 'vitest';

import {
  selectDicePresentation,
  shouldDebounceObserverDice,
} from './diceObserverPresentation';

const authoritativeDice = [
  { value: 5, isHeld: false },
  { value: 6, isHeld: true },
  { value: 4, isHeld: false },
  { value: 4, isHeld: false },
  { value: 6, isHeld: true },
];

const staleObserverDice = [
  { value: 5, isHeld: false },
  { value: 6, isHeld: true },
  { value: 4, isHeld: true },
  { value: 4, isHeld: true },
  { value: 6, isHeld: false },
];

describe('selectDicePresentation', () => {
  it('renders the accepted full hold mask directly for a Yahtzee observer', () => {
    const presented = selectDicePresentation(
      authoritativeDice,
      staleObserverDice,
      true,
      'yahtzee',
    );

    expect(presented).toBe(authoritativeDice);
    expect(presented.filter(die => die.isHeld).map(die => die.value)).toEqual([6, 6]);
  });

  it.each(['horses', 'ship-captain-crew'])(
    'preserves the observer debounce for %s',
    gameType => {
      expect(shouldDebounceObserverDice(true, gameType)).toBe(true);
      expect(selectDicePresentation(
        authoritativeDice,
        staleObserverDice,
        true,
        gameType,
      )).toBe(staleObserverDice);
    },
  );

  it('renders direct dice for the active roller in every game', () => {
    expect(selectDicePresentation(
      authoritativeDice,
      staleObserverDice,
      false,
      'yahtzee',
    )).toBe(authoritativeDice);
  });
});
