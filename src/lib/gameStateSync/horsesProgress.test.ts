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

  // ── Tie / rollover / repeated rollover tests ──────────────────

  it('tie → rollover → win: new-round reset is forward after baseline reset', () => {
    // Hand N complete state (high vector)
    const handNComplete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    // After tie, a NEW round is created → sync baseline resets to [0,0,0,0]
    // Hand N+1 starts fresh
    const handN1Start: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };

    // After baseline reset, the new hand start is forward from [0,0,0,0]
    const resetBaseline = [0, 0, 0, 0];
    expect(compareProgress(resetBaseline, getHorsesProgress(handN1Start))).toBe(1);

    // Within hand N+1, progress to complete
    const handN1Complete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    expect(compareProgress(getHorsesProgress(handN1Start), getHorsesProgress(handN1Complete))).toBe(1);
  });

  it('tie → rollover → tie → second rollover: double reset is safe', () => {
    // First hand complete
    const hand1Complete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    const hand1Progress = getHorsesProgress(hand1Complete);

    // Reset baseline for round 2
    const baseline2 = [0, 0, 0, 0];
    const hand2Start: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    expect(compareProgress(baseline2, getHorsesProgress(hand2Start))).toBe(1);

    // Second hand also ties and completes
    const hand2Complete: HorsesStateForProgress = {
      ...hand1Complete, // same shape
    };
    const hand2Progress = getHorsesProgress(hand2Complete);
    expect(compareProgress(getHorsesProgress(hand2Start), hand2Progress)).toBe(1);

    // Reset baseline for round 3
    const baseline3 = [0, 0, 0, 0];
    const hand3Start: HorsesStateForProgress = { ...hand2Start };
    expect(compareProgress(baseline3, getHorsesProgress(hand3Start))).toBe(1);
  });

  it('stale snapshot from prior round is regressive against new-round progress', () => {
    // Simulates: after baseline reset, a stale snapshot from old round arrives.
    // The gating layer resets baseline to [0,0,0,0] on roundId change.
    // Within the new round, progress has advanced to e.g. [1,0,0,1].
    // A stale snapshot cannot arrive with a HIGHER vector after a reset,
    // because the reset is triggered by a DIFFERENT roundId.
    // But within the same round, a stale snapshot with lower progress is rejected:
    const current: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    const stale: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    // stale has rollsRemaining=3 (rollProgress=0) vs current rollsRemaining=2 (rollProgress=1)
    expect(compareProgress(getHorsesProgress(current), getHorsesProgress(stale))).toBe(-1);
  });

  it('equal-vector but different content is treated as equal (not forward)', () => {
    const stateA: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    // Same structure = same vector even if dice values differ (vector doesn't encode dice)
    const stateB: HorsesStateForProgress = { ...stateA };
    expect(compareProgress(getHorsesProgress(stateA), getHorsesProgress(stateB))).toBe(0);
  });

  it('observer joining mid-rollover sees valid progress from reset baseline', () => {
    // Observer joins when a new round just started after tie
    // Their baseline starts at [0,0,0,0] (fresh sync framework)
    const baseline = [0, 0, 0, 0];
    const midGame: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 1 } },
    };
    expect(compareProgress(baseline, getHorsesProgress(midGame))).toBe(1);
  });

  it('rapid consecutive round resets produce valid progress sequences', () => {
    // Simulate 3 rapid resets (e.g., 3 ties in a row)
    for (let round = 0; round < 3; round++) {
      const baseline = [0, 0, 0, 0];
      const start: HorsesStateForProgress = {
        gamePhase: 'playing',
        turnOrder: ['a', 'b'],
        currentTurnPlayerId: 'a',
        playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
      };
      const complete: HorsesStateForProgress = {
        gamePhase: 'complete',
        turnOrder: ['a', 'b'],
        currentTurnPlayerId: null,
        playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
      };

      // Each round: baseline → start is forward
      expect(compareProgress(baseline, getHorsesProgress(start))).toBe(1);
      // start → complete is forward
      expect(compareProgress(getHorsesProgress(start), getHorsesProgress(complete))).toBe(1);
    }
  });
});
