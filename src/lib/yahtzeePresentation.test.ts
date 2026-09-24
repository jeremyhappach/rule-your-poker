import { describe, expect, it } from 'vitest';

import {
  createYahtzeeScoreAnnouncement,
  createYahtzeeTurnAnnouncement,
  describeYahtzeeScore,
  getDisplayedYahtzeeTotal,
  isYahtzeeScorePresentationSuperseded,
  resolveYahtzeeRemoteScorePresentation,
  YAHTZEE_SCORE_PRESENTATION_MS,
  yahtzeeScoreAnnouncementId,
} from './yahtzeePresentation';
import type { YahtzeeState } from './yahtzeeTypes';

const emptyScorecard = () => ({ scores: {}, yahtzeeBonuses: 0 });

const scoreAction: NonNullable<YahtzeeState['lastAction']> = {
  type: 'score',
  playerId: 'player-one',
  category: 'fours',
  score: 12,
  dice: [4, 4, 4, 2, 3].map(value => ({ value, isHeld: false })),
  sequence: 8,
};

describe('resolveYahtzeeRemoteScorePresentation', () => {
  it('uses one fixed interval for every score presentation owner', () => {
    expect(YAHTZEE_SCORE_PRESENTATION_MS).toBe(2500);
  });

  it('keeps the current turn in the ambient rail through rolls and category choice', () => {
    expect(createYahtzeeTurnAnnouncement({
      dealerGameId: 'dealer-game-1',
      roundId: 'round-1',
      playerId: 'player-one',
      playerName: 'Hap',
    })).toMatchObject({
      id: 'yahtzee-turn:round-1:player-one',
      type: 'gameplay_notice',
      behavior: 'ambient',
      payload: { title: 'Hap is rolling' },
    });
  });

  it('makes committed scoring immediately preempt roll narration for the shared presentation interval', () => {
    expect(createYahtzeeScoreAnnouncement({
      dealerGameId: 'dealer-game-1',
      roundId: 'round-1',
      playerName: 'Hap',
      action: scoreAction,
    })).toMatchObject({
      id: 'yahtzee-score:round-1:8',
      type: 'gameplay_notice',
      priority: 56,
      ttlMs: YAHTZEE_SCORE_PRESENTATION_MS,
      payload: { title: 'Hap scored 3 x 4s' },
    });
  });

  it('retires the exact score presentation as soon as a later action is known', () => {
    expect(yahtzeeScoreAnnouncementId('round-1', 8)).toBe('yahtzee-score:round-1:8');
    expect(isYahtzeeScorePresentationSuperseded(8, 8)).toBe(false);
    expect(isYahtzeeScorePresentationSuperseded(8, 9)).toBe(true);
    expect(isYahtzeeScorePresentationSuperseded(null, 9)).toBe(false);
  });

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

describe('getDisplayedYahtzeeTotal', () => {
  it('uses the authoritative scorecard total before and after scoring', () => {
    const scorecard = { scores: { fours: 12 }, yahtzeeBonuses: 0 };
    expect(getDisplayedYahtzeeTotal(scorecard)).toBe(12);
    expect(getDisplayedYahtzeeTotal(scorecard, { category: 'fours', value: 16 })).toBe(12);
  });

  it('preserves the optimistic score while the authoritative scorecard catches up', () => {
    const scorecard = emptyScorecard();
    expect(getDisplayedYahtzeeTotal(scorecard, { category: 'fours', value: 16 })).toBe(16);
  });

  it('includes the upper bonus when an optimistic upper score crosses the threshold', () => {
    const scorecard = {
      scores: {
        ones: 3,
        twos: 6,
        threes: 9,
        fours: 12,
        fives: 15,
        sixes: undefined,
      },
      yahtzeeBonuses: 0,
    };
    expect(getDisplayedYahtzeeTotal(scorecard, { category: 'sixes', value: 18 })).toBe(63 + 35);
  });

  it('keeps Yahtzee bonuses in the shared total derivation', () => {
    expect(getDisplayedYahtzeeTotal({ scores: {}, yahtzeeBonuses: 2 })).toBe(200);
  });

  it('does not overwrite a committed zero or mutate authoritative scores', () => {
    const scorecard = { scores: { fours: 0 }, yahtzeeBonuses: 0 };
    expect(getDisplayedYahtzeeTotal(scorecard, { category: 'fours', value: 20 })).toBe(0);
    expect(getDisplayedYahtzeeTotal(scorecard, { category: 'fives', value: 15 })).toBe(15);
    expect(scorecard).toEqual({ scores: { fours: 0 }, yahtzeeBonuses: 0 });
  });
});
