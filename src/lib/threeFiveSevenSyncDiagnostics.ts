/**
 * 3-5-7-specific sync diagnostics: invariant checks.
 *
 * Uses the reusable patterns from debugSyncInvariants.ts.
 * Prefix: [357-sync]
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistInvariantViolation, persistSyncDebugEvent } from './persistSyncDebugEvent';
import { buildMetaPayload } from './buildMeta';

// ── Opt-in 357 investigation helper ───────────────────────────
/**
 * Persist a 357 round-transition investigation event.
 * Routine informational traces are debug-gated. True invariant violations use
 * persistInvariantViolation and remain always-on; render/effect churn must not
 * generate production database traffic.
 */
export function persist357Investigation(
  gameId: string,
  handNumber: number,
  eventName: string,
  payload: Record<string, unknown>,
  roundId?: string | null,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType: '3-5-7',
    handNumber,
    roundId,
    eventType: 'transition',
    severity: 'info',
    eventName,
    payload: { ...payload, ...buildMetaPayload() },
  });
}

// ── Transition-type classifier ────────────────────────────────
/**
 * Derive a canonical transitionType from last_round_result string.
 * Called ONCE per transition, then forwarded to all downstream events.
 */
export type ThreeFiveSevenTransitionType = 'showdown' | 'fold-win' | 'pussy-tax' | 'sweep' | 'leg-win' | 'tie' | 'other';

export function classify357TransitionType(lastRoundResult: string | null | undefined): ThreeFiveSevenTransitionType {
  if (!lastRoundResult) return 'other';
  if (lastRoundResult.startsWith('357_SWEEP')) return 'sweep';
  if (lastRoundResult.includes('|||WINNER:')) return 'showdown';
  if (lastRoundResult.includes('won a leg')) return 'leg-win';
  if (lastRoundResult.toLowerCase().includes('pussy tax')) return 'pussy-tax';
  if (lastRoundResult.includes('tied with')) return 'tie';
  // Solo stayer (only one player stayed — fold-win)
  if (lastRoundResult.includes('won a leg') === false && lastRoundResult.includes('won') && !lastRoundResult.includes('showdown')) return 'fold-win';
  return 'other';
}

// ── INV-1: Stale round render ─────────────────────────────────
export function checkThreeFiveSevenStaleRound(
  gameId: string,
  renderedRound: number,
  authoritativeRound: number,
  handNumber: number,
): boolean {
  const ok = renderedRound >= authoritativeRound;
  if (!ok) {
    persistInvariantViolation(gameId, '3-5-7', handNumber, 'stale-round-render', {
      renderedRound, authoritativeRound, ...buildMetaPayload(),
    });
  }
  return checkInvariant('357', 'stale-round-render', ok,
    `Rendered round (${renderedRound}) lags authoritative round (${authoritativeRound})`,
    { renderedRound, authoritativeRound, handNumber, gameId },
  );
}

// ── INV-2: Stale hand render ──────────────────────────────────
export function checkThreeFiveSevenStaleHand(
  gameId: string,
  renderedHand: number,
  authoritativeHand: number,
): boolean {
  const ok = renderedHand >= authoritativeHand;
  if (!ok) {
    persistInvariantViolation(gameId, '3-5-7', authoritativeHand, 'stale-hand-render', {
      renderedHand, authoritativeHand, ...buildMetaPayload(),
    });
  }
  return checkInvariant('357', 'stale-hand-render', ok,
    `Rendered hand (${renderedHand}) lags authoritative hand (${authoritativeHand})`,
    { renderedHand, authoritativeHand, gameId },
  );
}

// ── INV-3: Result render mismatch ─────────────────────────────
export function checkThreeFiveSevenResultMismatch(
  gameId: string,
  resultHand: number,
  authoritativeHand: number,
): boolean {
  if (resultHand === 0 || authoritativeHand === 0) return true;
  const ok = resultHand >= authoritativeHand;
  if (!ok) {
    persistInvariantViolation(gameId, '3-5-7', authoritativeHand, 'result-render-mismatch', {
      resultHand, authoritativeHand, ...buildMetaPayload(),
    });
  }
  return checkInvariant('357', 'result-render-mismatch', ok,
    `Result overlay hand (${resultHand}) lags authoritative hand (${authoritativeHand})`,
    { resultHand, authoritativeHand, gameId },
  );
}

// ── INV-4: Decision after completed ───────────────────────────
export function checkThreeFiveSevenDecisionAfterCompleted(
  gameId: string,
  roundStatus: string,
  newDecisionLocked: boolean,
  handNumber: number,
  roundNumber: number,
): boolean {
  if (roundStatus !== 'completed' || !newDecisionLocked) return true;
  persistInvariantViolation(gameId, '3-5-7', handNumber, 'decision-after-completed', {
    roundStatus, roundNumber, ...buildMetaPayload(),
  });
  return checkInvariant('357', 'decision-after-completed', false,
    `Decision locked while round ${roundNumber} is already completed`,
    { roundStatus, roundNumber, handNumber, gameId },
  );
}

// ── INV-5: Stuck old round detected ───────────────────────────
export function checkThreeFiveSevenStuckOldRound(
  gameId: string,
  presentationRoundId: string | null,
  authoritativeRoundId: string | null,
  presentationRoundNumber: number | null,
  authoritativeRoundNumber: number | null,
  handNumber: number,
): boolean {
  if (!presentationRoundId || !authoritativeRoundId) return true;
  if (presentationRoundId === authoritativeRoundId) return true;
  // Presentation is showing a different (old) round than authoritative
  persistInvariantViolation(gameId, '3-5-7', handNumber, 'stuck-old-round-detected', {
    presentationRoundId: presentationRoundId.slice(0, 8),
    authoritativeRoundId: authoritativeRoundId.slice(0, 8),
    presentationRoundNumber,
    authoritativeRoundNumber,
    ...buildMetaPayload(),
  });
  return checkInvariant('357', 'stuck-old-round-detected', false,
    `Presentation stuck on round ${presentationRoundNumber} (${presentationRoundId.slice(0, 8)}) while authoritative is round ${authoritativeRoundNumber} (${authoritativeRoundId.slice(0, 8)})`,
    { presentationRoundId, authoritativeRoundId, presentationRoundNumber, authoritativeRoundNumber, handNumber, gameId },
  );
}

