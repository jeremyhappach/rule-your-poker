/**
 * Horses / Ship Captain Crew progress vector extraction.
 *
 * Progress vector (Phase 2 cutover):
 *   [handNumber, gamePhaseOrd, completedPlayerCount, turnIndex, rollProgress, holdSeq]
 *
 * Dimensions (left to right, most significant first):
 *
 *   1. handNumber — match-level monotonic counter. Hand transitions are now
 *      explicit in the progress gate; we no longer rely solely on identity
 *      reset for cross-hand protection. A new-hand snapshot is *always*
 *      forward of any prior-hand snapshot even before the framework reset
 *      lands.
 *
 *   2. gamePhaseOrd — waiting=0, playing=1, complete=2.
 *
 *   3. completedPlayerCount — how many players have isComplete=true.
 *
 *   4. turnIndex — index of currentTurnPlayerId within turnOrder (0-based,
 *      turnOrder.length when null).
 *
 *   5. rollProgress — 3 - rollsRemaining for the current turn player.
 *
 *   6. holdSeq — monotonically increasing within a single roll for the
 *      current turn player; resets on new roll (lower-significance dim
 *      protects rapid hold-toggle reordering).
 *
 * `handNumber` is sourced from the controller's monotonic identity latch
 * (not from horses_state, which does not persist hand_number). It is
 * passed in by the caller via the getProgress closure.
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

export function getHorsesProgress(
  state: HorsesStateForProgress | null,
  handNumber: number = 0,
): ProgressVector {
  if (!state) return [handNumber, 0, 0, 0, 0, 0];

  const phaseOrd = PHASE_ORD[state.gamePhase ?? 'waiting'] ?? 0;

  const playerStates = state.playerStates ?? {};
  let completedCount = 0;
  for (const ps of Object.values(playerStates)) {
    if (ps?.isComplete) completedCount++;
  }

  const turnOrder = state.turnOrder ?? [];
  const turnIdx = state.currentTurnPlayerId
    ? turnOrder.indexOf(state.currentTurnPlayerId)
    : turnOrder.length;

  const currentPlayerState = state.currentTurnPlayerId
    ? playerStates[state.currentTurnPlayerId]
    : null;
  const rollProgress = currentPlayerState
    ? 3 - (currentPlayerState.rollsRemaining ?? 3)
    : 0;

  const holdSeq = currentPlayerState?.holdSeq ?? 0;

  return [handNumber, phaseOrd, completedCount, turnIdx, rollProgress, holdSeq];
}
