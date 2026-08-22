import { describe, expect, it } from 'vitest';
import {
  advanceLiveTerminalPresentationScope,
  shouldHoldLiveTerminalPresentation,
  shouldHoldTerminalSeatOwnership,
  terminalPresentationIdentityMatchesLiveScope,
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

const liveYahtzeeHandTwoObservation: LiveTerminalPresentationObservation = {
  gameId: 'yahtzee-game-1',
  gameType: 'yahtzee',
  status: 'in_progress',
  dealerGameId: 'yahtzee-dealer-game-1',
  roundId: 'yahtzee-round-2',
  handNumber: 2,
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

describe('terminal seat ownership hold', () => {
  it('retains gameplay seats through a 3-5-7 game_over presentation', () => {
    expect(
      shouldHoldTerminalSeatOwnership('game_over', true, false, false),
    ).toBe(true);
  });

  it('retains gameplay seats through the existing session-ended hold signals', () => {
    expect(
      shouldHoldTerminalSeatOwnership('session_ended', false, true, false),
    ).toBe(true);
    expect(
      shouldHoldTerminalSeatOwnership('session_ended', false, false, true),
    ).toBe(true);
  });

  it('releases once presentation completes or lifecycle leaves terminal status', () => {
    expect(
      shouldHoldTerminalSeatOwnership('game_over', false, false, false),
    ).toBe(false);
    expect(
      shouldHoldTerminalSeatOwnership('game_selection', true, false, false),
    ).toBe(false);
  });
});

describe('Yahtzee live terminal presentation hold', () => {
  it('captures the authoritative second-hand scope observed by this mount', () => {
    expect(
      advanceLiveTerminalPresentationScope(null, liveYahtzeeHandTwoObservation),
    ).toEqual({
      gameId: 'yahtzee-game-1',
      gameType: 'yahtzee',
      dealerGameId: 'yahtzee-dealer-game-1',
      roundId: 'yahtzee-round-2',
      handNumber: 2,
    });
  });

  it('holds the matching second-hand scope when settlement ends the session', () => {
    const armed = advanceLiveTerminalPresentationScope(
      null,
      liveYahtzeeHandTwoObservation,
    );
    const ended = {
      ...liveYahtzeeHandTwoObservation,
      status: 'session_ended',
      terminalResultPresent: true,
    };

    const retained = advanceLiveTerminalPresentationScope(armed, ended);
    expect(retained).toBe(armed);
    expect(shouldHoldLiveTerminalPresentation(retained, ended)).toBe(true);
  });

  it('does not hold a fresh mount of an already-ended Yahtzee session', () => {
    const ended = {
      ...liveYahtzeeHandTwoObservation,
      status: 'session_ended',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(null, ended)).toBeNull();
    expect(shouldHoldLiveTerminalPresentation(null, ended)).toBe(false);
  });

  it.each([
    ['round', { roundId: 'yahtzee-round-3' }],
    ['hand', { handNumber: 3 }],
  ] as const)('rejects a terminal snapshot from a different %s identity', (_label, mismatch) => {
    const armed = advanceLiveTerminalPresentationScope(
      null,
      liveYahtzeeHandTwoObservation,
    );
    const ended = {
      ...liveYahtzeeHandTwoObservation,
      ...mismatch,
      status: 'session_ended',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(armed, ended)).toBeNull();
    expect(shouldHoldLiveTerminalPresentation(armed, ended)).toBe(false);
  });

  it('does not hold ordinary Yahtzee game_over progression', () => {
    const armed = advanceLiveTerminalPresentationScope(
      null,
      liveYahtzeeHandTwoObservation,
    );
    const gameOver = {
      ...liveYahtzeeHandTwoObservation,
      status: 'game_over',
      terminalResultPresent: true,
    };

    expect(advanceLiveTerminalPresentationScope(armed, gameOver)).toBeNull();
    expect(shouldHoldLiveTerminalPresentation(armed, gameOver)).toBe(false);
  });

  it('matches only a completion token from the retained live hand', () => {
    const scope = advanceLiveTerminalPresentationScope(
      null,
      liveYahtzeeHandTwoObservation,
    );

    expect(
      terminalPresentationIdentityMatchesLiveScope(
        'yahtzee|winseq|yahtzee-game-1|yahtzee-dealer-game-1|2|winner-1',
        scope,
      ),
    ).toBe(true);
    expect(
      terminalPresentationIdentityMatchesLiveScope(
        'yahtzee|winseq|yahtzee-game-1|yahtzee-dealer-game-1|1|winner-1',
        scope,
      ),
    ).toBe(false);
    expect(
      terminalPresentationIdentityMatchesLiveScope(
        'cribbage|winseq|yahtzee-game-1|yahtzee-dealer-game-1|2|winner-1',
        scope,
      ),
    ).toBe(false);
  });
});
