/**
 * Yahtzee sync diagnostics — minimal invariant + transition event coverage.
 *
 * Always-persist invariants:
 *   stale-turn-render          — previous turn's dice/state visible after turn advance
 *   phase-render-mismatch      — playing/complete UI does not match current sync phase
 *   stuck-null-turn             — gamePhase 'playing' but currentTurnPlayerId is null
 *   regressive-categories       — total scored categories decreased
 *
 * Debug-gated transitions:
 *   hand-start, turn-advance, score-applied, result-display
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';
import type { YahtzeeState } from './yahtzeeTypes';

// ── Always-persist invariants ─────────────────────────────────

/**
 * INV-1: stale-turn-render
 * Fires if presentation shows a turn player that is no longer the current turn.
 */
export function checkYahtzeeStaleTurn(
  gameId: string,
  renderedTurnPlayerId: string | null,
  authoritativeTurnPlayerId: string | null,
  handNumber: number,
): boolean {
  if (!renderedTurnPlayerId || !authoritativeTurnPlayerId) return true;
  return checkInvariant(
    'yahtzee',
    'stale-turn-render',
    renderedTurnPlayerId === authoritativeTurnPlayerId,
    `Rendered turn ${renderedTurnPlayerId.slice(0, 8)} != authoritative ${authoritativeTurnPlayerId.slice(0, 8)}`,
    { gameId, renderedTurnPlayerId, authoritativeTurnPlayerId, handNumber },
  );
}

/**
 * INV-2: phase-render-mismatch
 * Fires if UI shows input controls during 'complete' phase or result during 'playing'.
 */
export function checkYahtzeePhaseRenderMismatch(
  gameId: string,
  handNumber: number,
  gamePhase: string,
  uiCategory: 'input' | 'result' | 'waiting',
): boolean {
  let ok = true;
  if (uiCategory === 'result' && gamePhase !== 'complete') ok = false;
  if (uiCategory === 'input' && gamePhase !== 'playing') ok = false;

  return checkInvariant(
    'yahtzee',
    'phase-render-mismatch',
    ok,
    `UI category '${uiCategory}' shown during phase '${gamePhase}'`,
    { gameId, handNumber, gamePhase, uiCategory },
  );
}

/**
 * INV-3: stuck-null-turn
 * Fires if game is 'playing' but no current turn player.
 */
export function checkYahtzeeStuckNullTurn(
  gameId: string,
  handNumber: number,
  gamePhase: string,
  currentTurnPlayerId: string | null,
): boolean {
  if (gamePhase !== 'playing') return true;
  return checkInvariant(
    'yahtzee',
    'stuck-null-turn',
    currentTurnPlayerId !== null,
    `Game phase is 'playing' but currentTurnPlayerId is null`,
    { gameId, handNumber, gamePhase },
  );
}

/**
 * INV-4: regressive-categories
 * Fires if total scored categories decreased (should be monotonic within a game).
 */
let _lastTotalCategories: Record<string, number> = {};

export function checkYahtzeeRegressiveCategories(
  gameId: string,
  handNumber: number,
  totalCategoriesFilled: number,
): boolean {
  const key = gameId;
  const prev = _lastTotalCategories[key] ?? 0;

  const ok = totalCategoriesFilled >= prev;
  const result = checkInvariant(
    'yahtzee',
    'regressive-categories',
    ok,
    `Total categories regressed from ${prev} to ${totalCategoriesFilled}`,
    { gameId, handNumber, prev, totalCategoriesFilled },
  );

  if (ok) _lastTotalCategories[key] = totalCategoriesFilled;
  return result;
}

export function resetYahtzeeTracking(gameId?: string): void {
  if (gameId) delete _lastTotalCategories[gameId];
  else _lastTotalCategories = {};
}

// ── Debug-gated transition events ─────────────────────────────

export function logYahtzeeHandStart(
  gameId: string,
  handNumber: number,
  playerCount: number,
  roundId?: string,
): void {
  persistTransition(gameId, 'yahtzee', handNumber, 'hand-start', {
    playerCount,
  }, roundId);
}

export function logYahtzeeTurnAdvance(
  gameId: string,
  handNumber: number,
  fromPlayerId: string | null,
  toPlayerId: string | null,
): void {
  persistTransition(gameId, 'yahtzee', handNumber, 'turn-advance', {
    from: fromPlayerId?.slice(0, 8) ?? null,
    to: toPlayerId?.slice(0, 8) ?? null,
  });
}

export function logYahtzeeScoreApplied(
  gameId: string,
  handNumber: number,
  playerId: string,
  category: string,
  score: number,
): void {
  persistTransition(gameId, 'yahtzee', handNumber, 'score-applied', {
    playerId: playerId.slice(0, 8),
    category,
    score,
  });
}

export function logYahtzeeResultDisplay(
  gameId: string,
  handNumber: number,
  winnerId: string | null,
  winnerScore: number | null,
): void {
  persistTransition(gameId, 'yahtzee', handNumber, 'result-display', {
    winnerId: winnerId?.slice(0, 8) ?? null,
    winnerScore,
  });
}
