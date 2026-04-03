/**
 * SCC (Ship Captain Crew) sync diagnostics — expand beyond stuck-state checks.
 *
 * Always-persist invariants:
 *   duplicate-ante-correction — incorrect pot/ante is later corrected
 *
 * Debug-gated transitions:
 *   ante-applied, turn-advance
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';

// ── Always-persist invariant ──────────────────────────────────

/**
 * INV: duplicate-ante-correction
 * Fires if pot value doesn't match expected ante × playerCount.
 */
export function checkDuplicateAnteCorrection(
  gameId: string,
  handNumber: number,
  actualPot: number,
  expectedPot: number,
  playerCount: number,
  anteAmount: number,
): boolean {
  return checkInvariant(
    'ship-captain-crew',
    'duplicate-ante-correction',
    actualPot === expectedPot,
    `Pot ${actualPot} != expected ${expectedPot} (${playerCount} × ${anteAmount})`,
    { gameId, handNumber, actualPot, expectedPot, playerCount, anteAmount },
  );
}

// ── Debug-gated transitions ───────────────────────────────────

export function logSCCAnteApplied(
  gameId: string,
  handNumber: number,
  pot: number,
  playerCount: number,
  anteAmount: number,
  roundId?: string,
): void {
  persistTransition(gameId, 'ship-captain-crew', handNumber, 'ante-applied', {
    pot,
    playerCount,
    anteAmount,
  }, roundId);
}

export function logSCCTurnAdvance(
  gameId: string,
  handNumber: number,
  fromPlayerId: string | null,
  toPlayerId: string | null,
  roundId?: string,
): void {
  persistTransition(gameId, 'ship-captain-crew', handNumber, 'turn-advance', {
    from: fromPlayerId?.slice(0, 8) ?? null,
    to: toPlayerId?.slice(0, 8) ?? null,
  }, roundId);
}
