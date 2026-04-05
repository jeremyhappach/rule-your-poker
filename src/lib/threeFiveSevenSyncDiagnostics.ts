/**
 * 3-5-7-specific sync diagnostics: invariant checks.
 *
 * Uses the reusable patterns from debugSyncInvariants.ts.
 * Prefix: [357-sync]
 */

import { checkInvariant, logSyncSummary, logSyncGateResult } from './debugSyncInvariants';
import type { ThreeFiveSevenAuthoritativeSnapshot } from '@/lib/gameStateSync/threeFiveSevenProgress';
import { persistSyncDebugEvent } from './persistSyncDebugEvent';
import { buildMetaPayload } from './buildMeta';

// ── INV-1: Stale round render ─────────────────────────────────
/**
 * Rendered roundNumber lags authoritative roundNumber.
 */
export function checkThreeFiveSevenStaleRound(
  gameId: string,
  renderedRound: number,
  authoritativeRound: number,
  handNumber: number,
): boolean {
  const ok = renderedRound >= authoritativeRound;
  if (!ok) {
    persistSyncEvent(gameId, '3-5-7', handNumber, 'invariant', 'stale-round-render', {
      renderedRound,
      authoritativeRound,
      ...buildMetaPayload(),
    });
  }
  return checkInvariant(
    '357',
    'stale-round-render',
    ok,
    `Rendered round (${renderedRound}) lags authoritative round (${authoritativeRound})`,
    { renderedRound, authoritativeRound, handNumber, gameId },
  );
}

// ── INV-2: Stale hand render ──────────────────────────────────
/**
 * Rendered handNumber lags authoritative handNumber.
 */
export function checkThreeFiveSevenStaleHand(
  gameId: string,
  renderedHand: number,
  authoritativeHand: number,
): boolean {
  const ok = renderedHand >= authoritativeHand;
  if (!ok) {
    persistSyncEvent(gameId, '3-5-7', authoritativeHand, 'invariant', 'stale-hand-render', {
      renderedHand,
      authoritativeHand,
      ...buildMetaPayload(),
    });
  }
  return checkInvariant(
    '357',
    'stale-hand-render',
    ok,
    `Rendered hand (${renderedHand}) lags authoritative hand (${authoritativeHand})`,
    { renderedHand, authoritativeHand, gameId },
  );
}

// ── INV-3: Result render mismatch ─────────────────────────────
/**
 * Result overlay shows previous hand's data while authoritative is on new hand.
 */
export function checkThreeFiveSevenResultMismatch(
  gameId: string,
  resultHand: number,
  authoritativeHand: number,
): boolean {
  // Don't fire during bootstrap (hand 0)
  if (resultHand === 0 || authoritativeHand === 0) return true;

  const ok = resultHand >= authoritativeHand;
  if (!ok) {
    persistSyncEvent(gameId, '3-5-7', authoritativeHand, 'invariant', 'result-render-mismatch', {
      resultHand,
      authoritativeHand,
      ...buildMetaPayload(),
    });
  }
  return checkInvariant(
    '357',
    'result-render-mismatch',
    ok,
    `Result overlay hand (${resultHand}) lags authoritative hand (${authoritativeHand})`,
    { resultHand, authoritativeHand, gameId },
  );
}

// ── INV-4: Decision after completed ───────────────────────────
/**
 * Player decision locked while round is already completed.
 */
export function checkThreeFiveSevenDecisionAfterCompleted(
  gameId: string,
  roundStatus: string,
  newDecisionLocked: boolean,
  handNumber: number,
  roundNumber: number,
): boolean {
  if (roundStatus !== 'completed' || !newDecisionLocked) return true;

  persistSyncEvent(gameId, '3-5-7', handNumber, 'invariant', 'decision-after-completed', {
    roundStatus,
    roundNumber,
    ...buildMetaPayload(),
  });
  return checkInvariant(
    '357',
    'decision-after-completed',
    false,
    `Decision locked while round ${roundNumber} is already completed`,
    { roundStatus, roundNumber, handNumber, gameId },
  );
}

// ── Sync gate logger ──────────────────────────────────────────
export function logThreeFiveSevenSyncGate(
  accepted: boolean,
  reason: string,
  current: unknown,
  incoming: unknown,
  extra?: Record<string, unknown>,
): void {
  logSyncGateResult('357-sync', accepted, reason, { current, incoming }, extra);
}

// ── State summary ─────────────────────────────────────────────
export function logThreeFiveSevenSummary(
  label: string,
  snapshot: ThreeFiveSevenAuthoritativeSnapshot | null,
): void {
  if (!snapshot) return;
  logSyncSummary('357-sync', label, {
    hand: snapshot.handNumber,
    round: snapshot.roundNumber,
    phase: snapshot.roundStatus,
    decided: snapshot.players.filter(p => p.decisionLocked).length,
    pot: snapshot.pot,
    cardsDealt: snapshot.cardsDealt,
  });
}
