/**
 * Horses sync diagnostics — minimal invariant + transition event coverage.
 *
 * Always-persist invariants:
 *   stuck-null-turn             — gamePhase 'playing' but currentTurnPlayerId is null
 *   stuck-all-complete          — all players isComplete but gamePhase still 'playing'
 *   phase-render-mismatch       — UI shows input during 'complete' or result during 'playing'
 *   regressive-hand-identity    — hand number regresses across updates
 *
 * Debug-gated transitions:
 *   hand-start, turn-advance, ante-applied, result-display, tie-rollover, stuck-recovery
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';

// ── Always-persist invariants ─────────────────────────────────

/**
 * INV-1: stuck-null-turn
 * Fires if game is 'playing' but no current turn player.
 */
export function checkHorsesStuckNullTurn(
  gameId: string,
  handNumber: number,
  gamePhase: string,
  currentTurnPlayerId: string | null,
): boolean {
  if (gamePhase !== 'playing') return true;
  return checkInvariant(
    'horses',
    'stuck-null-turn',
    currentTurnPlayerId !== null,
    `Game phase is 'playing' but currentTurnPlayerId is null`,
    { gameId, handNumber, gamePhase },
  );
}

/**
 * INV-2: stuck-all-complete
 * Fires if all players are complete but game phase is still 'playing'.
 */
export function checkHorsesStuckAllComplete(
  gameId: string,
  handNumber: number,
  gamePhase: string,
  playerStates: Record<string, { isComplete?: boolean }>,
  turnOrder: string[],
): boolean {
  if (gamePhase !== 'playing' || turnOrder.length === 0) return true;
  const allComplete = turnOrder.every(pid => playerStates[pid]?.isComplete);
  return checkInvariant(
    'horses',
    'stuck-all-complete',
    !allComplete,
    `All ${turnOrder.length} players complete but phase still 'playing'`,
    { gameId, handNumber, playerCount: turnOrder.length },
  );
}

/**
 * INV-3: phase-render-mismatch
 */
export function checkHorsesPhaseRenderMismatch(
  gameId: string,
  handNumber: number,
  gamePhase: string,
  uiCategory: 'input' | 'result' | 'waiting',
): boolean {
  let ok = true;
  if (uiCategory === 'result' && gamePhase !== 'complete') ok = false;
  if (uiCategory === 'input' && gamePhase !== 'playing') ok = false;

  return checkInvariant(
    'horses',
    'phase-render-mismatch',
    ok,
    `UI category '${uiCategory}' shown during phase '${gamePhase}'`,
    { gameId, handNumber, gamePhase, uiCategory },
  );
}

/**
 * INV-4: regressive-hand-identity
 */
let _lastAcceptedHand: Record<string, number> = {};

export function checkHorsesRegressiveHand(
  gameId: string,
  incomingHandNumber: number,
): boolean {
  const prev = _lastAcceptedHand[gameId] ?? 0;
  if (incomingHandNumber === 0) return true;

  const ok = incomingHandNumber >= prev;
  const result = checkInvariant(
    'horses',
    'regressive-hand-identity',
    ok,
    `Hand regressed from ${prev} to ${incomingHandNumber}`,
    { gameId, prev, incomingHandNumber, handNumber: incomingHandNumber },
  );

  if (ok) _lastAcceptedHand[gameId] = incomingHandNumber;
  return result;
}

export function resetHorsesTracking(gameId?: string): void {
  if (gameId) delete _lastAcceptedHand[gameId];
  else _lastAcceptedHand = {};
}

// ── Debug-gated transition events ─────────────────────────────

export function logHorsesHandStart(
  gameId: string,
  handNumber: number,
  playerCount: number,
  gameType: string,
  roundId?: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'hand-start', {
    playerCount,
  }, roundId);
}

export function logHorsesTurnAdvance(
  gameId: string,
  handNumber: number,
  fromPlayerId: string | null,
  toPlayerId: string | null,
  gameType: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'turn-advance', {
    from: fromPlayerId?.slice(0, 8) ?? null,
    to: toPlayerId?.slice(0, 8) ?? null,
  });
}

export function logHorsesAnteApplied(
  gameId: string,
  handNumber: number,
  pot: number,
  playerCount: number,
  anteAmount: number,
  gameType: string,
  roundId?: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'ante-applied', {
    pot,
    playerCount,
    anteAmount,
  }, roundId);
}

export function logHorsesResultDisplay(
  gameId: string,
  handNumber: number,
  winnerId: string | null,
  isTie: boolean,
  gameType: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'result-display', {
    winnerId: winnerId?.slice(0, 8) ?? null,
    isTie,
  });
}

export function logHorsesTieRollover(
  gameId: string,
  handNumber: number,
  tiedPlayerCount: number,
  gameType: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'tie-rollover', {
    tiedPlayerCount,
  });
}

export function logHorsesStuckRecovery(
  gameId: string,
  handNumber: number,
  reason: string,
  gameType: string,
): void {
  persistTransition(gameId, gameType, handNumber, 'stuck-recovery', {
    reason,
  });
}
