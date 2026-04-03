/**
 * Gin Rummy sync diagnostics — minimal invariant + transition event coverage.
 *
 * Always-persist invariants:
 *   stale-hand-render          — previous hand cards/state visible after hand reset
 *   phase-render-mismatch      — draw/discard/result UI does not match current sync phase
 *   result-render-mismatch     — displayed result/scoring does not match current presentation hand
 *   regressive-hand-identity   — accepted/rendered hand identity moves backward or mixes hands
 *
 * Debug-gated transitions:
 *   hand-start, discard-applied, draw-applied, result-display
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';
import type { GinRummyState, GinRummyPhase } from './ginRummyTypes';

// ── Compact state summary ─────────────────────────────────────

export function ginRummyStateSummary(
  state: GinRummyState | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if (!state) return { state: null, ...extra };
  return {
    phase: state.phase,
    hand: state.handNumber ?? 0,
    action: state.actionCount ?? 0,
    turn: state.currentTurnPlayerId?.slice(0, 8) ?? null,
    turnPhase: state.turnPhase,
    stockSize: state.stockPile?.length ?? 0,
    discardSize: state.discardPile?.length ?? 0,
    winner: state.winnerPlayerId?.slice(0, 8) ?? null,
    ...extra,
  };
}

// ── Always-persist invariants ─────────────────────────────────

/**
 * INV-1: stale-hand-render
 * Fires if the rendered hand number doesn't match the current authoritative hand.
 */
export function checkStaleHandRender(
  gameId: string,
  renderHandNumber: number,
  authoritativeHandNumber: number,
): boolean {
  if (renderHandNumber === 0) return true; // bootstrap
  return checkInvariant(
    'gin-rummy',
    'stale-hand-render',
    renderHandNumber >= authoritativeHandNumber,
    `Render hand ${renderHandNumber} behind authoritative ${authoritativeHandNumber}`,
    { gameId, renderHandNumber, authoritativeHandNumber, handNumber: authoritativeHandNumber },
  );
}

/**
 * INV-2: phase-render-mismatch
 * Fires if UI phase category disagrees with sync phase.
 */
export function checkPhaseRenderMismatch(
  gameId: string,
  handNumber: number,
  presentationPhase: GinRummyPhase,
  uiCategory: 'input' | 'result' | 'waiting',
): boolean {
  const resultPhases: GinRummyPhase[] = ['scoring', 'complete'];
  const inputPhases: GinRummyPhase[] = ['first_draw', 'playing', 'knocking', 'laying_off'];

  let ok = true;
  if (uiCategory === 'result' && !resultPhases.includes(presentationPhase)) ok = false;
  if (uiCategory === 'input' && !inputPhases.includes(presentationPhase)) ok = false;

  return checkInvariant(
    'gin-rummy',
    'phase-render-mismatch',
    ok,
    `UI category '${uiCategory}' shown during phase '${presentationPhase}'`,
    { gameId, handNumber, presentationPhase, uiCategory },
  );
}

/**
 * INV-3: result-render-mismatch
 * Fires if result display hand doesn't match presentation hand.
 */
export function checkResultRenderMismatch(
  gameId: string,
  displayedHandNumber: number,
  presentationHandNumber: number,
): boolean {
  if (displayedHandNumber === 0) return true; // not showing result
  return checkInvariant(
    'gin-rummy',
    'result-render-mismatch',
    displayedHandNumber === presentationHandNumber,
    `Result display hand ${displayedHandNumber} != presentation ${presentationHandNumber}`,
    { gameId, displayedHandNumber, presentationHandNumber, handNumber: presentationHandNumber },
  );
}

/**
 * INV-4: regressive-hand-identity
 * Fires if accepted hand number goes backward.
 */
let _lastAcceptedHand: Record<string, number> = {};

export function checkRegressiveHandIdentity(
  gameId: string,
  incomingHandNumber: number,
): boolean {
  const prev = _lastAcceptedHand[gameId] ?? 0;
  if (incomingHandNumber === 0) return true;

  const ok = incomingHandNumber >= prev;
  const result = checkInvariant(
    'gin-rummy',
    'regressive-hand-identity',
    ok,
    `Hand regressed from ${prev} to ${incomingHandNumber}`,
    { gameId, prev, incomingHandNumber, handNumber: incomingHandNumber },
  );

  if (ok) _lastAcceptedHand[gameId] = incomingHandNumber;
  return result;
}

export function resetGinRummyTracking(gameId?: string): void {
  if (gameId) delete _lastAcceptedHand[gameId];
  else _lastAcceptedHand = {};
}

// ── Debug-gated transition events ─────────────────────────────

export function logGinHandStart(
  gameId: string,
  handNumber: number,
  dealerId: string,
  roundId?: string,
): void {
  persistTransition(gameId, 'gin-rummy', handNumber, 'hand-start', {
    dealerId: dealerId.slice(0, 8),
  }, roundId);
}

export function logGinDrawApplied(
  gameId: string,
  handNumber: number,
  playerId: string,
  source: 'stock' | 'discard',
): void {
  persistTransition(gameId, 'gin-rummy', handNumber, 'draw-applied', {
    playerId: playerId.slice(0, 8),
    source,
  });
}

export function logGinDiscardApplied(
  gameId: string,
  handNumber: number,
  playerId: string,
): void {
  persistTransition(gameId, 'gin-rummy', handNumber, 'discard-applied', {
    playerId: playerId.slice(0, 8),
  });
}

export function logGinResultDisplay(
  gameId: string,
  handNumber: number,
  winnerId: string | null,
  isGin: boolean,
  isUndercut: boolean,
): void {
  persistTransition(gameId, 'gin-rummy', handNumber, 'result-display', {
    winnerId: winnerId?.slice(0, 8) ?? null,
    isGin,
    isUndercut,
  });
}
