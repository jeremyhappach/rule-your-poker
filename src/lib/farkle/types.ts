/** Mirrors the immutable farkle/1 database contract. No client scoring defaults. */
export type FarkleEndgame = 'immediate' | 'equal_turns' | 'one_last_turn';
export type FarkleAction = 'roll' | 'hold' | 'bank';
export interface FarkleRules {
  version: 1;
  singles: { '1': number; '5': number };
  ofAKind: Record<'3' | '4' | '5' | '6', number[]>;
  straight: number;
  threePairs: number;
  twoTriplets: number;
  fourPlusPair: number;
}
export interface FarkleConfig {
  version: 1;
  rules: FarkleRules;
  ante_amount: number;
  targetScore: number;
  endgame: FarkleEndgame;
  botPolicy: 'balanced';
  botBankThreshold: number;
  turnSeconds: number;
  botDelayMs: number;
  testOnly: boolean;
  testLabel?: string;
}
export interface FarkleDie { index: number; value: number }
export interface FarklePlayerScore { banked: number; completedTurns: number }
export interface FarkleEvent {
  type: string;
  playerId?: string;
  winnerPlayerId?: string;
  dice?: FarkleDie[];
  indexes?: number[];
  points?: number;
  lost?: number;
  thisTurn?: number;
  completedTurns?: number;
  banked?: number;
  rollNumber?: number;
  scoringCycle?: number;
  tiebreakTurn?: number;
}
export interface FarkleState {
  version: 1;
  scoringVersion: 1;
  _authorityScope: string;
  actionSequence: number;
  gamePhase: 'playing' | 'complete';
  turnOrder: string[];
  eligible: string[];
  playerStates: Record<string, FarklePlayerScore>;
  currentTurnPlayerId: string;
  stage: 'roll' | 'hold' | 'bank_or_roll';
  thisTurn: number;
  available: number[];
  dice: FarkleDie[];
  legalHolds: Array<{ indexes: number[]; points: number }>;
  rollNumber: number;
  scoringCycle: number;
  finalQueue: string[] | null;
  targetReachedBy: string | null;
  tiebreakTurn: number;
  winnerPlayerId: string | null;
  config: FarkleConfig;
  events?: FarkleEvent[];
  turnDeadline?: string | null;
}
export interface FarkleReplayFrame {
  sequence: number;
  actorId: string | null;
  events: FarkleEvent[];
  stateAfter: FarkleState;
  configHash: string;
}
export interface FarkleReplay {
  contract: 'farkle-replay/1';
  roundId: string;
  dealerGameId: string;
  config: FarkleConfig;
  events: FarkleReplayFrame[];
}
export interface FarkleScope { gameId: string; dealerGameId: string; roundId: string; handNumber: number }

export const FARKLE_ENDGAME_LABELS: Record<FarkleEndgame, string> = {
  immediate: 'Immediate', equal_turns: 'Equal Turns', one_last_turn: 'One Last Turn',
};
