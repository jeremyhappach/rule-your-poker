import { describe, expect, it } from 'vitest';
import {
  resolveSelectedCardGameConfig,
  type CardGameDefaults,
  type CardGameSetupSnapshot,
} from './cardGameSelection';

const threeFiveSevenDefaults: CardGameDefaults = {
  ante_amount: 5,
  rollover_amount: 1,
  leg_value: 1,
  legs_to_win: 3,
  pussy_tax_enabled: false,
  pussy_tax_value: 1,
  pot_max_enabled: false,
  pot_max_value: 10,
  chucky_cards: 4,
  rabbit_hunt: false,
  reveal_at_showdown: false,
};

describe('resolveSelectedCardGameConfig', () => {
  it('never seeds 3-5-7 from a previous Cribbage snapshot', () => {
    const cribbageSnapshot: CardGameSetupSnapshot = {
      ...threeFiveSevenDefaults,
      game_type: 'cribbage',
      ante_amount: 10,
      leg_value: 0,
      legs_to_win: 0,
    };

    expect(resolveSelectedCardGameConfig(
      '3-5-7',
      cribbageSnapshot,
      threeFiveSevenDefaults,
    )).toEqual(threeFiveSevenDefaults);
  });

  it('preserves the exact same-game snapshot for an explicit run-back selection', () => {
    const priorThreeFiveSeven: CardGameSetupSnapshot = {
      ...threeFiveSevenDefaults,
      game_type: '3-5-7',
      ante_amount: 12,
      legs_to_win: 5,
    };

    expect(resolveSelectedCardGameConfig(
      '3-5-7',
      priorThreeFiveSeven,
      threeFiveSevenDefaults,
    )).toEqual(priorThreeFiveSeven);
  });
});
