/**
 * Horses / Ship Captain Crew progress vector extraction.
 *
 * Progress vector: [gamePhaseOrd, completedPlayerCount, turnIndex, rollProgress]
 *
 * Dimensions (left to right, most significant first):
 *
 *   1. gamePhaseOrd — waiting=0, playing=1, complete=2
 *      Ensures game-complete snapshots are always forward from playing.
 *
 *   2. completedPlayerCount — how many players have isComplete=true
 *      Monotonically increases as each player finishes their turn.
 *      Critical for tie detection: all players complete is the terminal state.
 *
 *   3. turnIndex — index of currentTurnPlayerId within turnOrder (0-based)
 *      Increases as the turn advances left-to-right through the table.
 *      -1 if currentTurnPlayerId is null (complete phase).
 *      NOTE: For 2-player ties/rollovers, this resets to 0 in the NEW round
 *      (new roundId), so it's always forward within a single round.
 *
 *   4. rollProgress — 3 - rollsRemaining for the current turn player (0-3)
 *      0 = hasn't rolled, 3 = all rolls used.
 *      Monotonically increases within a single turn.
 *
 * Tie / Rollover handling:
 *   - Ties create a NEW round (new roundId), so the sync framework's
 *     reset(null) is called on roundId change, resetting the progress
 *     baseline. Within the new round, progress starts fresh at [1,0,0,0].
 *   - This means tie → rollover → new hand is handled by boundary reset,
 *     NOT by embedding handNumber in the vector (unlike Gin Rummy).
 *     This is correct because Horses creates a new DB round record per hand.
 */

import type { ProgressVector } from './types';

export interface HorsesStateForProgress {
  gamePhase?: 'waiting' | 'playing' | 'complete' | null;
  currentTurnPlayerId?: string | null;
  turnOrder?: string[];
  playerStates?: Record<string, { isComplete?: boolean; rollsRemaining?: number; rollKey?: number; holdSeq?: number }>;
}

const PHASE_ORD: Record<string, number> = {
  waiting: 0,
  playing: 1,
  complete: 2,
};

export function getHorsesProgress(state: HorsesStateForProgress | null): ProgressVector {
  if (!state) return [0, 0, 0, 0, 0];

  const phaseOrd = PHASE_ORD[state.gamePhase ?? 'waiting'] ?? 0;

  // Count completed players
  const playerStates = state.playerStates ?? {};
  let completedCount = 0;
  for (const ps of Object.values(playerStates)) {
    if (ps?.isComplete) completedCount++;
  }

  // Turn index within turnOrder
  const turnOrder = state.turnOrder ?? [];
  const turnIdx = state.currentTurnPlayerId
    ? turnOrder.indexOf(state.currentTurnPlayerId)
    : turnOrder.length; // null turn = past all players (complete)

  // Roll progress for current turn player
  const currentPlayerState = state.currentTurnPlayerId
    ? playerStates[state.currentTurnPlayerId]
    : null;
  const rollProgress = currentPlayerState
    ? 3 - (currentPlayerState.rollsRemaining ?? 3)
    : 0;

  // Hold sequence: monotonically increasing within a roll, resets on new roll
  const holdSeq = currentPlayerState?.holdSeq ?? 0;

  return [phaseOrd, completedCount, turnIdx, rollProgress, holdSeq];
}
