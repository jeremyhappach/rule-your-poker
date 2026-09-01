import { describe, expect, it } from 'vitest';

import { isYahtzeeManualTurnOpen } from './yahtzeeManualTurnAdmission';

const futureDeadline = '2026-09-01T15:01:00.000Z';
const nowMs = Date.parse('2026-09-01T15:00:00.000Z');

describe('Yahtzee manual-turn admission', () => {
  it('admits only the active unpaused human before the authoritative deadline', () => {
    expect(isYahtzeeManualTurnOpen({
      gamePhase: 'playing',
      isMyTurn: true,
      isPaused: false,
      isAutomated: false,
      deadline: futureDeadline,
      nowMs,
    })).toBe(true);
  });

  it.each([
    ['at expiry', futureDeadline, Date.parse(futureDeadline), false, false, true, 'playing'],
    ['after expiry', futureDeadline, Date.parse(futureDeadline) + 1, false, false, true, 'playing'],
    ['without a deadline', null, nowMs, false, false, true, 'playing'],
    ['while paused', futureDeadline, nowMs, true, false, true, 'playing'],
    ['during Auto-roll', futureDeadline, nowMs, false, true, true, 'playing'],
    ['on another player turn', futureDeadline, nowMs, false, false, false, 'playing'],
    ['outside gameplay', futureDeadline, nowMs, false, false, true, 'complete'],
  ])('fails closed %s', (_label, deadline, currentMs, isPaused, isAutomated, isMyTurn, gamePhase) => {
    expect(isYahtzeeManualTurnOpen({
      gamePhase,
      isMyTurn,
      isPaused,
      isAutomated,
      deadline,
      nowMs: currentMs,
    })).toBe(false);
  });
});
