/**
 * Cribbage sync diagnostics — minimal invariant + transition event coverage.
 *
 * Always-persist invariants:
 *   stale-dealer-game-render   — prior dealer-game state visible in new dealer-game
 *   phase-render-mismatch      — presentation doesn't match pegging/hand/scoring phase
 *   result-render-mismatch     — rendered cards/score display doesn't match presentation state
 *   regressive-identity        — dealer-game/hand identity regresses or mixed state appears
 *
 * Debug-gated transitions:
 *   dealer-game-start, hand-start, scoring-start, result-display
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';
import type { CribbagePhase } from './cribbageTypes';

// ── Always-persist invariants ─────────────────────────────────

/**
 * INV-1: stale-dealer-game-render
 * Fires if the rendered Cribbage identity doesn't match the authoritative one.
 *
 * NOTE: On the active mobile path this compares round/hand render identity, not
 * only dealer-game IDs, because stale visuals happen within a dealer game too.
 */
export function checkStaleDealerGameRender(
  gameId: string,
  renderedIdentity: string | null,
  authoritativeIdentity: string | null,
  handNumber: number,
): boolean {
  if (!renderedIdentity || !authoritativeIdentity) return true; // bootstrap
  return checkInvariant(
    'cribbage',
    'stale-dealer-game-render',
    renderedIdentity === authoritativeIdentity,
    `Rendered identity ${renderedIdentity.slice(0, 32)} != auth ${authoritativeIdentity.slice(0, 32)}`,
    {
      gameId,
      renderedIdentity: renderedIdentity.slice(0, 40),
      authoritativeIdentity: authoritativeIdentity.slice(0, 40),
      handNumber,
    },
  );
}

/**
 * INV-2: phase-render-mismatch
 * Fires if UI phase category disagrees with cribbage phase.
 */
export function checkCribbagePhaseRenderMismatch(
  gameId: string,
  handNumber: number,
  presentationPhase: CribbagePhase,
  uiCategory: 'input' | 'scoring' | 'result' | 'waiting',
): boolean {
  const scoringPhases: CribbagePhase[] = ['counting'];
  const resultPhases: CribbagePhase[] = ['complete'];
  const inputPhases: CribbagePhase[] = ['discarding', 'cutting', 'pegging'];

  let ok = true;
  if (uiCategory === 'scoring' && !scoringPhases.includes(presentationPhase)) ok = false;
  if (uiCategory === 'result' && !resultPhases.includes(presentationPhase)) ok = false;
  if (uiCategory === 'input' && !inputPhases.includes(presentationPhase)) ok = false;

  return checkInvariant(
    'cribbage',
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
export function checkCribbageResultRenderMismatch(
  gameId: string,
  displayedHandNumber: number,
  presentationHandNumber: number,
): boolean {
  if (displayedHandNumber === 0) return true;
  return checkInvariant(
    'cribbage',
    'result-render-mismatch',
    displayedHandNumber === presentationHandNumber,
    `Result hand ${displayedHandNumber} != presentation ${presentationHandNumber}`,
    { gameId, displayedHandNumber, presentationHandNumber, handNumber: presentationHandNumber },
  );
}

/**
 * INV-4: regressive-identity
 * Fires if dealer-game + hand identity moves backward.
 */
let _lastAccepted: Record<string, { dealerGameId: string; handNumber: number }> = {};

export function checkRegressiveIdentity(
  gameId: string,
  dealerGameId: string | null,
  handNumber: number,
): boolean {
  if (!dealerGameId || handNumber === 0) return true;
  const prev = _lastAccepted[gameId];
  if (!prev) {
    _lastAccepted[gameId] = { dealerGameId, handNumber };
    return true;
  }

  // Same dealer game: hand must not regress
  if (dealerGameId === prev.dealerGameId) {
    const ok = handNumber >= prev.handNumber;
    const result = checkInvariant(
      'cribbage',
      'regressive-identity',
      ok,
      `Hand regressed from ${prev.handNumber} to ${handNumber} in same dealer-game`,
      { gameId, dealerGameId: dealerGameId.slice(0, 16), prev: prev.handNumber, handNumber },
    );
    if (ok) _lastAccepted[gameId] = { dealerGameId, handNumber };
    return result;
  }

  // Different dealer game: always accept (new session)
  _lastAccepted[gameId] = { dealerGameId, handNumber };
  return true;
}

export function resetCribbageTracking(gameId?: string): void {
  if (gameId) delete _lastAccepted[gameId];
  else _lastAccepted = {};
}

// ── INV-5: CRIBBAGE_HAND_REVERSION ────────────────────────────
//
// Fires if presentation hand returns to 6 cards after a discard was applied,
// or if presentation hand contains cards not in the authoritative post-discard state.

interface HandReversionCheck {
  gameId: string;
  handNumber: number;
  authoritativeHandSize: number;
  presentationHandSize: number;
  authoritativeCardIds: string[];
  presentationCardIds: string[];
  progressVector: unknown;
  source: string;
  roundId?: string;
  dealerGameId?: string;
}

let _lastPresentationHandSize: Record<string, number> = {};

export function checkCribbageHandReversion(params: HandReversionCheck): boolean {
  const key = `${params.gameId}:hand`;
  const prevSize = _lastPresentationHandSize[key] ?? 0;
  _lastPresentationHandSize[key] = params.presentationHandSize;

  // Detect reversion: presentation went from <=4 back to 6 cards
  const reverted = prevSize > 0 && prevSize <= 4 && params.presentationHandSize === 6;

  // Detect card mismatch: presentation contains cards NOT in authoritative
  const extraCards = params.presentationCardIds.filter(
    c => !params.authoritativeCardIds.includes(c),
  );
  const hasMismatch = extraCards.length > 0 && params.authoritativeHandSize < params.presentationHandSize;

  if (!reverted && !hasMismatch) return true;

  return checkInvariant(
    'cribbage',
    'hand-reversion',
    false,
    reverted
      ? `Hand reverted from ${prevSize} to ${params.presentationHandSize} cards`
      : `Presentation has ${extraCards.length} cards not in authoritative state`,
    {
      gameId: params.gameId,
      handNumber: params.handNumber,
      prevPresentationSize: prevSize,
      authoritativeHandSize: params.authoritativeHandSize,
      presentationHandSize: params.presentationHandSize,
      authoritativeCardIds: params.authoritativeCardIds,
      presentationCardIds: params.presentationCardIds,
      extraCards,
      progressVector: params.progressVector,
      source: params.source,
      roundId: params.roundId,
      dealerGameId: params.dealerGameId,
    },
  );
}

// ── INV-6: CRIBBAGE_SCORE_REVERSION ───────────────────────────
//
// Fires if presentation score decreases without a true game/round reset.

let _lastPresentationScores: Record<string, Record<string, number>> = {};

export function checkCribbageScoreReversion(
  gameId: string,
  handNumber: number,
  presentationScores: Record<string, number>,
  authoritativeScores: Record<string, number>,
  source: string,
  roundId?: string,
  dealerGameId?: string,
  progressVector?: unknown,
): boolean {
  const key = gameId;
  const prev = _lastPresentationScores[key];
  _lastPresentationScores[key] = { ...presentationScores };

  if (!prev) return true;

  const regressions: Array<{
    playerId: string;
    prevScore: number;
    newScore: number;
  }> = [];

  for (const [pid, newScore] of Object.entries(presentationScores)) {
    const prevScore = prev[pid];
    if (prevScore !== undefined && newScore < prevScore && prevScore > 0) {
      regressions.push({ playerId: pid.slice(0, 16), prevScore, newScore });
    }
  }

  if (regressions.length === 0) return true;

  return checkInvariant(
    'cribbage',
    'score-reversion',
    false,
    `Score decreased for ${regressions.length} player(s)`,
    {
      gameId,
      handNumber,
      regressions,
      presentationScores: Object.fromEntries(
        Object.entries(presentationScores).map(([k, v]) => [k.slice(0, 16), v]),
      ),
      authoritativeScores: Object.fromEntries(
        Object.entries(authoritativeScores).map(([k, v]) => [k.slice(0, 16), v]),
      ),
      source,
      roundId,
      dealerGameId,
      progressVector,
    },
  );
}


export function resetCribbageReversionTracking(gameId?: string): void {
  if (gameId) {
    delete _lastPresentationHandSize[`${gameId}:hand`];
    delete _lastPresentationScores[gameId];
  } else {
    _lastPresentationHandSize = {};
    _lastPresentationScores = {};
  }
}

// ── Debug-gated transition events ─────────────────────────────

export function logCribbageDealerGameStart(
  gameId: string,
  handNumber: number,
  dealerGameId: string,
  roundId?: string,
): void {
  persistTransition(gameId, 'cribbage', handNumber, 'dealer-game-start', {
    dealerGameId: dealerGameId.slice(0, 16),
  }, roundId);
}

export function logCribbageHandStart(
  gameId: string,
  handNumber: number,
  dealerId: string,
  roundId?: string,
): void {
  persistTransition(gameId, 'cribbage', handNumber, 'hand-start', {
    dealerId: dealerId.slice(0, 16),
  }, roundId);
}

export function logCribbageScoringStart(
  gameId: string,
  handNumber: number,
  roundId?: string,
): void {
  persistTransition(gameId, 'cribbage', handNumber, 'scoring-start', {}, roundId);
}

export function logCribbageResultDisplay(
  gameId: string,
  handNumber: number,
  winnerId: string | null,
  winnerScore: number,
  roundId?: string,
): void {
  persistTransition(gameId, 'cribbage', handNumber, 'result-display', {
    winnerId: winnerId?.slice(0, 16) ?? null,
    winnerScore,
  }, roundId);
}
