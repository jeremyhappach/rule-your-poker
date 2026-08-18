import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import { matchesThreeFiveSevenPresentationCursor } from './announcementPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

export type ThreeFiveSevenFinancialPresentation =
  | ThreeFiveSevenAllFoldPresentation
  | ThreeFiveSevenRolloverPresentation;

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
