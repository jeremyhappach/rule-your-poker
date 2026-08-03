import { describe, expect, it } from 'vitest';
import {
  advanceLiveTerminalPresentationScope,
  shouldHoldLiveTerminalPresentation,
  type LiveTerminalPresentationObservation,
} from './liveTerminalPresentationHold';

const liveObservation: LiveTerminalPresentationObservation = {
  gameId: 'game-1',
  gameType: 'cribbage',
  status: 'in_progress',
  dealerGameId: 'dealer-game-1',
  roundId: 'round-7',
  handNumber: 7,
  terminalResultPresent: false,
};

describe('live terminal presentation hold', () => {
  it('captures immutable scope while this mount observes live play', () => {
    expect(advanceLiveTerminalPresentationScope(null, liveObservation)).toEqual({
      gameId: 'game-1',
      gameType: 'cribbage',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-7',
      handNumber: 7,
    });
  });

  it('holds the same mounted scope when settlement ends the session', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const ended = {
      ...liveObservation,
      status: 'session_ended',
      terminalResultPresent: true,
    };

    const retained = advanceLiveTerminalPresentationScope(armed, ended);
    expect(retained).toBe(armed);
    expect(shouldHoldLiveTerminalPresentation(retained, ended)).toBe(true);
  });

  it('retains proven live identity while the matching round row is temporarily absent', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const incompleteLive = {
      ...liveObservation,
      roundId: null,
      handNumber: null,
    };

    expect(advanceLiveTerminalPresentationScope(armed, incompleteLive)).toBe(armed);
  });

  it('does not hold a fresh mount of an already-ended session', () => {
    const ended = {
      ...liveObservation,
      status: 'session_ended',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(null, ended)).toBeNull();
    expect(shouldHoldLiveTerminalPresentation(null, ended)).toBe(false);
  });

  it('rejects a terminal snapshot from a different dealer-game identity', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const ended = {
      ...liveObservation,
      status: 'session_ended',
      dealerGameId: 'dealer-game-2',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(armed, ended)).toBeNull();
    expect(shouldHoldLiveTerminalPresentation(armed, ended)).toBe(false);
  });

  it('accepts a terminal fetch with temporarily missing round details', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const ended = {
      ...liveObservation,
      status: 'session_ended',
      roundId: null,
      handNumber: null,
      terminalResultPresent: true,
    };

    const retained = advanceLiveTerminalPresentationScope(armed, ended);
    expect(retained).toBe(armed);
    expect(shouldHoldLiveTerminalPresentation(retained, ended)).toBe(true);
  });

  it('clears the scope on a non-terminal lifecycle change', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const gameOver = {
      ...liveObservation,
      status: 'game_over',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(armed, gameOver)).toBeNull();
  });

  it('clears the scope when the route leaves Cribbage', () => {
    const armed = advanceLiveTerminalPresentationScope(null, liveObservation);
    const holm = {
      ...liveObservation,
      gameType: null,
      dealerGameId: null,
      roundId: null,
      handNumber: null,
    };

    expect(advanceLiveTerminalPresentationScope(armed, holm)).toBeNull();
  });
});
