import { describe, it, expect } from 'vitest';
import { getHorsesProgress, HorsesStateForProgress } from './horsesProgress';
import { compareProgress } from './stateProgress';

describe('getHorsesProgress', () => {
  it('null state returns zero vector', () => {
    expect(getHorsesProgress(null)).toEqual([0, 0, 0, 0]);
  });

  it('waiting phase is less than playing', () => {
    const waiting: HorsesStateForProgress = { gamePhase: 'waiting', turnOrder: ['a', 'b'], currentTurnPlayerId: null, playerStates: {} };
    const playing: HorsesStateForProgress = { gamePhase: 'playing', turnOrder: ['a', 'b'], currentTurnPlayerId: 'a', playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } } };
    expect(compareProgress(getHorsesProgress(waiting), getHorsesProgress(playing))).toBe(1);
  });

  it('roll progress increases within a turn', () => {
    const roll0: HorsesStateForProgress = { gamePhase: 'playing', turnOrder: ['a', 'b'], currentTurnPlayerId: 'a', playerStates: { a: { isComplete: false, rollsRemaining: 3 } } };
    const roll1: HorsesStateForProgress = { ...roll0, playerStates: { a: { isComplete: false, rollsRemaining: 2 } } };
    const roll2: HorsesStateForProgress = { ...roll0, playerStates: { a: { isComplete: false, rollsRemaining: 1 } } };
    const roll3: HorsesStateForProgress = { ...roll0, playerStates: { a: { isComplete: false, rollsRemaining: 0 } } };

    expect(compareProgress(getHorsesProgress(roll0), getHorsesProgress(roll1))).toBe(1);
    expect(compareProgress(getHorsesProgress(roll1), getHorsesProgress(roll2))).toBe(1);
    expect(compareProgress(getHorsesProgress(roll2), getHorsesProgress(roll3))).toBe(1);
  });

  it('turn advance is forward progress even when rolls reset', () => {
    const playerAComplete: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    const playerBStart: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    // Player B starting (turnIdx=1, completedCount=1) > Player A done (turnIdx=0, completedCount=1)
    // Even though rollProgress resets to 0
    expect(compareProgress(getHorsesProgress(playerAComplete), getHorsesProgress(playerBStart))).toBe(1);
  });

  it('game complete is forward from all players done in playing phase', () => {
    const allDonePlaying: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    const complete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    expect(compareProgress(getHorsesProgress(allDonePlaying), getHorsesProgress(complete))).toBe(1);
  });

  it('3-player game: turn advances are monotonic', () => {
    const turnA: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b', 'c'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 }, c: { isComplete: false, rollsRemaining: 3 } },
    };
    const turnADone: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b', 'c'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 3 }, c: { isComplete: false, rollsRemaining: 3 } },
    };
    const turnB: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b', 'c'], currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 3 }, c: { isComplete: false, rollsRemaining: 3 } },
    };
    const turnBDone: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b', 'c'], currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 }, c: { isComplete: false, rollsRemaining: 3 } },
    };
    const turnC: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b', 'c'], currentTurnPlayerId: 'c',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 }, c: { isComplete: false, rollsRemaining: 3 } },
    };

    expect(compareProgress(getHorsesProgress(turnA), getHorsesProgress(turnADone))).toBe(1);
    expect(compareProgress(getHorsesProgress(turnADone), getHorsesProgress(turnB))).toBe(1);
    expect(compareProgress(getHorsesProgress(turnB), getHorsesProgress(turnBDone))).toBe(1);
    expect(compareProgress(getHorsesProgress(turnBDone), getHorsesProgress(turnC))).toBe(1);
  });
});
