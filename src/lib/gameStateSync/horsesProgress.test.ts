import { describe, it, expect } from 'vitest';
import { getHorsesProgress, HorsesStateForProgress } from './horsesProgress';
import { compareProgress } from './stateProgress';

describe('getHorsesProgress', () => {
  it('null state returns zero vector', () => {
    expect(getHorsesProgress(null)).toEqual([0, 0, 0, 0, 0, 0]);
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

  // ── holdSeq tiebreaker tests ─────────────────────────────────

  it('higher holdSeq is forward on same roll', () => {
    const hold0: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 0 } },
    };
    const hold1: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 1 } },
    };
    const hold2: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 2 } },
    };
    expect(compareProgress(getHorsesProgress(hold0), getHorsesProgress(hold1))).toBe(1);
    expect(compareProgress(getHorsesProgress(hold1), getHorsesProgress(hold2))).toBe(1);
  });

  it('lower holdSeq is regressive on same roll', () => {
    const hold3: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 3 } },
    };
    const hold1: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 1 } },
    };
    expect(compareProgress(getHorsesProgress(hold3), getHorsesProgress(hold1))).toBe(-1);
  });

  it('holdSeq resets to 0 on new roll without regression', () => {
    // End of roll 1 with holdSeq=5
    const roll1Hold5: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 5 } },
    };
    // New roll: rollsRemaining decreases (rollProgress increases), holdSeq resets to 0
    const roll2Hold0: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 1, holdSeq: 0 } },
    };
    // rollProgress 1→2 dominates holdSeq 5→0, so this is forward
    expect(compareProgress(getHorsesProgress(roll1Hold5), getHorsesProgress(roll2Hold0))).toBe(1);
  });

  it('same roll same holdSeq is equal', () => {
    const stateA: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 3 } },
    };
    const stateB: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2, holdSeq: 3 } },
    };
    expect(compareProgress(getHorsesProgress(stateA), getHorsesProgress(stateB))).toBe(0);
  });

  // ── Tie / rollover / repeated rollover tests ──────────────────

  it('tie → rollover → win: new-round reset is forward after baseline reset', () => {
    const handNComplete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    const handN1Start: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };

    const resetBaseline = [0, 0, 0, 0, 0, 0];
    expect(compareProgress(resetBaseline, getHorsesProgress(handN1Start))).toBe(1);

    const handN1Complete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    expect(compareProgress(getHorsesProgress(handN1Start), getHorsesProgress(handN1Complete))).toBe(1);
  });

  it('tie → rollover → tie → second rollover: double reset is safe', () => {
    const hand1Complete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };

    const baseline2 = [0, 0, 0, 0, 0, 0];
    const hand2Start: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    expect(compareProgress(baseline2, getHorsesProgress(hand2Start))).toBe(1);

    const hand2Complete: HorsesStateForProgress = { ...hand1Complete };
    expect(compareProgress(getHorsesProgress(hand2Start), getHorsesProgress(hand2Complete))).toBe(1);

    const baseline3 = [0, 0, 0, 0, 0, 0];
    const hand3Start: HorsesStateForProgress = { ...hand2Start };
    expect(compareProgress(baseline3, getHorsesProgress(hand3Start))).toBe(1);
  });

  it('stale snapshot from prior round is regressive against new-round progress', () => {
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
    expect(compareProgress(getHorsesProgress(current), getHorsesProgress(stale))).toBe(-1);
  });

  it('equal-vector but different content is treated as equal (not forward)', () => {
    const stateA: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 2 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    const stateB: HorsesStateForProgress = { ...stateA };
    expect(compareProgress(getHorsesProgress(stateA), getHorsesProgress(stateB))).toBe(0);
  });

  it('observer joining mid-rollover sees valid progress from reset baseline', () => {
    const baseline = [0, 0, 0, 0, 0, 0];
    const midGame: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 1 } },
    };
    expect(compareProgress(baseline, getHorsesProgress(midGame))).toBe(1);
  });

  it('rapid consecutive round resets produce valid progress sequences', () => {
    for (let round = 0; round < 3; round++) {
      const baseline = [0, 0, 0, 0, 0, 0];
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

      expect(compareProgress(baseline, getHorsesProgress(start))).toBe(1);
      expect(compareProgress(getHorsesProgress(start), getHorsesProgress(complete))).toBe(1);
    }
  });

  // ── Cross-hand monotonicity (Phase 2 cutover) ────────────────

  it('new-hand snapshot is forward of prior-hand terminal snapshot via handNumber', () => {
    const prevHandComplete: HorsesStateForProgress = {
      gamePhase: 'complete',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: null,
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: true, rollsRemaining: 0 } },
    };
    const nextHandStart: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    // Without handNumber dimension, nextHandStart would compare LESS than prevHandComplete
    // (playing<complete, 0<2 completed). handNumber prepend makes it forward regardless.
    expect(compareProgress(
      getHorsesProgress(prevHandComplete, 5),
      getHorsesProgress(nextHandStart, 6),
    )).toBe(1);
  });

  it('stale prior-hand snapshot is regressive against current-hand progress via handNumber', () => {
    const stalePrevHand: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'b',
      playerStates: { a: { isComplete: true, rollsRemaining: 0 }, b: { isComplete: false, rollsRemaining: 1 } },
    };
    const currentHandEarly: HorsesStateForProgress = {
      gamePhase: 'playing',
      turnOrder: ['a', 'b'],
      currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    expect(compareProgress(
      getHorsesProgress(stalePrevHand, 7),
      getHorsesProgress(currentHandEarly, 8),
    )).toBe(1);
  });

  it('same handNumber preserves intra-hand ordering', () => {
    const turnA: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 3 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    const turnAMidRoll: HorsesStateForProgress = {
      gamePhase: 'playing', turnOrder: ['a', 'b'], currentTurnPlayerId: 'a',
      playerStates: { a: { isComplete: false, rollsRemaining: 1 }, b: { isComplete: false, rollsRemaining: 3 } },
    };
    expect(compareProgress(getHorsesProgress(turnA, 3), getHorsesProgress(turnAMidRoll, 3))).toBe(1);
  });
});
