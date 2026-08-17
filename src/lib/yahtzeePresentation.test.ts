import { describe, expect, it } from 'vitest';

import { describeYahtzeeScore, resolveYahtzeeRemoteScorePresentation } from './yahtzeePresentation';
import type { YahtzeeState } from './yahtzeeTypes';

const scoreAction: NonNullable<YahtzeeState['lastAction']> = {
  type: 'score',
  playerId: 'player-one',
  category: 'fours',
  score: 12,
  dice: [4, 4, 4, 2, 3].map(value => ({ value, isHeld: false })),
  sequence: 8,
};

describe('resolveYahtzeeRemoteScorePresentation', () => {
  it('recognizes an unseen remote score on the first render after atomic turn handoff', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 8, lastAction: scoreAction },
      'player-two',
      false,
      null,
      true,
    )).toEqual({ active: true, action: scoreAction });
  });

  it('does not replay durable score history while the initial snapshot hydrates', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 8, lastAction: scoreAction },
      'player-two',
      false,
      null,
      false,
    )).toEqual({ active: false, action: null });
  });

  it('holds the scorer while the effect-driven highlight remains active', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 8, lastAction: scoreAction },
      'player-two',
      true,
      8,
      true,
    )).toEqual({ active: true, action: scoreAction });
  });

  it('releases the new turn after the score highlight completes', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 8, lastAction: scoreAction },
      'player-two',
      false,
      8,
      true,
    )).toEqual({ active: false, action: null });
  });

  it('never treats the local scorer as a remote presentation', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 8, lastAction: scoreAction },
      'player-one',
      false,
      null,
      true,
    )).toEqual({ active: false, action: null });
  });

  it('does not replay an old score after the next durable action', () => {
    expect(resolveYahtzeeRemoteScorePresentation(
      { actionSequence: 9, lastAction: scoreAction },
      'player-two',
      false,
      null,
      true,
    )).toEqual({ active: false, action: null });
  });

  it('narrates upper scores by matching dice and straight scores by category', () => {
    expect(describeYahtzeeScore(scoreAction)).toBe('3 x 4s');
    expect(describeYahtzeeScore({
      ...scoreAction,
      category: 'large_straight',
      score: 40,
    })).toBe('a large straight');
  });
});
