import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import { matchesThreeFiveSevenPresentationCursor } from './announcementPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';
import {
  deriveThreeFiveSevenDecisionRevealFrame,
  type ThreeFiveSevenDecisionRevealClock,
} from './decisionReveal';

export interface ThreeFiveSevenRevealedFinancialPresentation {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: number;
  revealId: string;
  /** Upper bound from the same accepted atomic round frame, not a live batch. */
  transferCursor: number;
}

/** A missing clock is unknown, never evidence that this round was revealed. */
export function buildThreeFiveSevenRevealedFinancialPresentation({
  gameId, dealerGameId, roundId, handNumber, roundNumber, transferCursor,
  roundCompleted, revealClock, revealBlocked, nowMs,
}: {
  gameId: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  roundNumber: number | null | undefined;
  transferCursor: number | null | undefined;
  roundCompleted: boolean;
  revealClock: ThreeFiveSevenDecisionRevealClock | null | undefined;
  revealBlocked: boolean;
  nowMs: number;
}): ThreeFiveSevenRevealedFinancialPresentation | null {
  if (!revealClock || !roundCompleted || revealBlocked
    || !gameId || !dealerGameId || !roundId
    || !Number.isInteger(handNumber) || handNumber! < 1
    || !Number.isInteger(roundNumber) || roundNumber! < 1
    || !Number.isSafeInteger(transferCursor) || transferCursor! < 1) return null;

  const { window } = revealClock;
  if (window.gameId !== gameId || window.dealerGameId !== dealerGameId
    || window.roundId !== roundId || window.handNumber !== handNumber
    || window.roundNumber !== roundNumber
    || deriveThreeFiveSevenDecisionRevealFrame(revealClock, nowMs).active) return null;

  return {
    gameId, dealerGameId, roundId, handNumber: handNumber!, roundNumber: roundNumber!,
    revealId: window.id, transferCursor: transferCursor!,
  };
}

/**
 * Leg purchases have no flight: admitting one immediately releases both its
 * closing balance and signed residual helper. Only a fully revealed accepted
 * frame may release that cursor. Retained receipts cover delayed older batches,
 * never a newer round's charge arriving before its frame/reveal clock.
 */
export function getThreeFiveSevenLegChargeAdmission(
  batch: Pick<ChipPresentationBatch, 'game_id' | 'cursor' | 'reason'>,
  revealed: ThreeFiveSevenRevealedFinancialPresentation | null | undefined,
): boolean | null {
  if (batch.reason !== 'leg') return null;
  return !!revealed && batch.game_id === revealed.gameId
    && Number.isSafeInteger(batch.cursor) && batch.cursor > 0
    && batch.cursor <= revealed.transferCursor;
}

export type ThreeFiveSevenFinancialPresentation =
  | ThreeFiveSevenAllFoldPresentation
  | ThreeFiveSevenRolloverPresentation
  | ThreeFiveSevenRevealedFinancialPresentation;

interface ThreeFiveSevenFinancialScope {
  gameId: string | null | undefined;
  dealerGameId: string | null | undefined;
}

/**
 * A live transfer may still be moving on one client after another client has
 * published the authoritative successor round. Preserve the exact local
 * cursor claim through that authority change; only a newer cursor or a true
 * game/dealer-game boundary may replace it.
 */
export function retainThreeFiveSevenFinancialPresentation<
  TPresentation extends ThreeFiveSevenFinancialPresentation,
>(
  retained: TPresentation | null | undefined,
  candidate: TPresentation | null | undefined,
  scope: ThreeFiveSevenFinancialScope,
): TPresentation | null {
  if (!scope.gameId || !scope.dealerGameId) return null;

  const retainedMatchesScope = !!retained
    && retained.gameId === scope.gameId
    && retained.dealerGameId === scope.dealerGameId
    && retained.transferCursor != null;
  const candidateMatchesScope = !!candidate
    && candidate.gameId === scope.gameId
    && candidate.dealerGameId === scope.dealerGameId
    && candidate.transferCursor != null;

  if (!candidateMatchesScope) return retainedMatchesScope ? retained! : null;
  if (!retainedMatchesScope) return candidate!;

  return candidate!.transferCursor! >= retained!.transferCursor!
    ? candidate!
    : retained!;
}

/**
 * Returns null for batches outside the 3-5-7 tax/re-ante seam. A boolean is
 * an owned admission decision and is based only on the retained exact cursor,
 * never the mutable current-round presentation.
 */
export function getThreeFiveSevenPlayerToPotAdmission(
  batch: Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'>,
  pussyTax: ThreeFiveSevenAllFoldPresentation | null | undefined,
  reAnte: ThreeFiveSevenRolloverPresentation | null | undefined,
): boolean | null {
  const movesPlayerToPot = batch.transfers.some(
    (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'pot',
  );
  if (!movesPlayerToPot) return null;

  if (batch.reason === 'bet') {
    return matchesThreeFiveSevenPresentationCursor(pussyTax, batch.cursor);
  }
  if (batch.reason === 'ante') {
    return matchesThreeFiveSevenPresentationCursor(reAnte, batch.cursor);
  }
  return null;
}
