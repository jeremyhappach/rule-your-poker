import { describe, expect, it } from 'vitest';

import { getCanonicalTimerEligibility } from './timerEligibility';

describe('Holm canonical timer eligibility', () => {
  it('keeps the timer hidden while settled cards still have transport work', () => {
    expect(getCanonicalTimerEligibility({
      gameType: 'holm-game',
      dealPhase: 'READY',
      dealSettled: true,
      readyReleased: false,
      activePlayerId: 'player-1',
    })).toEqual({ visible: false, running: false });
  });

  it('allows the timer only after the canonical deal release', () => {
    expect(getCanonicalTimerEligibility({
      gameType: 'holm-game',
      dealPhase: 'GAMEPLAY',
      dealSettled: true,
      readyReleased: true,
      activePlayerId: 'player-1',
    })).toEqual({ visible: true, running: true });
  });
});
