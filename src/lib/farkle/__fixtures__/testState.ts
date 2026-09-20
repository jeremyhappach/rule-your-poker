import type { FarkleState } from '../types';

/** TEST ONLY values, deliberately isolated from production defaults and setup. */
export function farkleTestState(): FarkleState {
  return {
    version: 1, scoringVersion: 1, _authorityScope: '00000000-0000-4000-8000-000000000001', actionSequence: 1,
    gamePhase: 'playing', turnOrder: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
    eligible: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
    playerStates: { '00000000-0000-4000-8000-000000000002': { banked: 0, completedTurns: 0 }, '00000000-0000-4000-8000-000000000003': { banked: 0, completedTurns: 0 } },
    currentTurnPlayerId: '00000000-0000-4000-8000-000000000002', stage: 'hold', thisTurn: 0,
    available: [0, 1, 2, 3, 4, 5], dice: [1, 1, 2, 3, 4, 6].map((value, index) => ({ index, value })),
    legalHolds: [{ indexes: [0], points: 100 }, { indexes: [1], points: 100 }, { indexes: [0, 1], points: 200 }],
    rollNumber: 1, scoringCycle: 1, finalQueue: null, targetReachedBy: null, tiebreakTurn: 0, winnerPlayerId: null,
    config: { version: 1, ante_amount: 2, targetScore: 1000, endgame: 'one_last_turn', botPolicy: 'balanced', botBankThreshold: 300,
      turnSeconds: 30, botDelayMs: 1000, testOnly: true, testLabel: 'TEST ONLY: client contract proof',
      rules: { version: 1, singles: { '1': 100, '5': 50 }, ofAKind: { '3': [1000, 200, 300, 400, 500, 600], '4': [1000, 1000, 1000, 1000, 1000, 1000], '5': [2000, 2000, 2000, 2000, 2000, 2000], '6': [3000, 3000, 3000, 3000, 3000, 3000] }, straight: 1500, threePairs: 1500, twoTriplets: 2500, fourPlusPair: 1500 } },
  };
}
