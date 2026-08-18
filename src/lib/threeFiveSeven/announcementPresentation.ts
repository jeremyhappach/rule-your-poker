import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  getThreeFiveSevenAllFoldPresentationKey,
  type ThreeFiveSevenAllFoldPresentation,
} from './allFoldPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

export interface ThreeFiveSevenCursorAnnouncement {
  id: string;
  scope: string;
  text: 'Pussy Tax!' | 'Re-Ante';
  kind: 'pussy_tax' | 'reante';
  handNumber: number;
  transferCursor: number;
}

type ThreeFiveSevenTransferPresentation =
  | ThreeFiveSevenAllFoldPresentation
  | ThreeFiveSevenRolloverPresentation;

export function matchesThreeFiveSevenPresentationCursor(
  presentation: ThreeFiveSevenTransferPresentation | null | undefined,
  cursor: number,
): boolean {
  return !!presentation
    && presentation.transferCursor != null
    && presentation.transferCursor === cursor;
}

export function getThreeFiveSevenPussyTaxAnnouncementScope(
  presentation: ThreeFiveSevenAllFoldPresentation,
): string {
  return `357-pussy-tax:${getThreeFiveSevenAllFoldPresentationKey(presentation)}`;
}

function getThreeFiveSevenPussyTaxAnnouncement(
  presentation: ThreeFiveSevenAllFoldPresentation,
): ThreeFiveSevenCursorAnnouncement {

  const scope = getThreeFiveSevenPussyTaxAnnouncementScope(presentation);
  return {
    id: `round_win:${scope}`,
    scope,
    text: 'Pussy Tax!',
    kind: 'pussy_tax',
    handNumber: presentation.handNumber,
    transferCursor: presentation.transferCursor!,
  };
}

export function getThreeFiveSevenReAnteAnnouncementScope(
  presentation: ThreeFiveSevenRolloverPresentation,
): string {
  return [
    '357-re-ante',
    presentation.gameId,
    presentation.dealerGameId,
    presentation.roundId,
    presentation.handNumber,
    presentation.transferCursor,
  ].join(':');
}

function getThreeFiveSevenReAnteAnnouncement(
  presentation: ThreeFiveSevenRolloverPresentation,
): ThreeFiveSevenCursorAnnouncement {
  const scope = getThreeFiveSevenReAnteAnnouncementScope(presentation);
  return {
    id: `peg:${scope}`,
    scope,
    text: 'Re-Ante',
    kind: 'reante',
    handNumber: presentation.handNumber,
    transferCursor: presentation.transferCursor!,
  };
}

/**
 * Classifies the exact live financial batch at the canonical launch edge.
 * Announcement publication must use this boundary rather than a React render
 * of the transient `running` cursor state, which can collapse into `settled`.
 */
export function getThreeFiveSevenBatchStartAnnouncement(
  batch: Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'>,
  pussyTax: ThreeFiveSevenAllFoldPresentation | null | undefined,
  reAnte: ThreeFiveSevenRolloverPresentation | null | undefined,
): ThreeFiveSevenCursorAnnouncement | null {
  const movesPlayerToPot = batch.transfers.some(
    (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'pot',
  );
  if (!movesPlayerToPot) return null;

  if (
    batch.reason === 'bet'
    && !!pussyTax
    && matchesThreeFiveSevenPresentationCursor(pussyTax, batch.cursor)
  ) {
    return getThreeFiveSevenPussyTaxAnnouncement(pussyTax);
  }

  // H1/R1 is the opening ante. Only a later hand's R3 -> R1 transfer is a
  // re-ante, even though both use the same exact rollover identity shape.
  if (
    batch.reason === 'ante'
    && !!reAnte
    && reAnte.handNumber > 1
    && matchesThreeFiveSevenPresentationCursor(reAnte, batch.cursor)
  ) {
    return getThreeFiveSevenReAnteAnnouncement(reAnte);
  }

  return null;
}

export function isThreeFiveSevenDedicatedResultAnnouncement(
  lastRoundResult: string | null | undefined,
): boolean {
  if (!lastRoundResult) return false;
  if (lastRoundResult === 'All players folded') return true;

  const displayText = lastRoundResult.split('|||')[0];
  return /\bwon a leg\b/i.test(displayText)
    || /\bstayed alone and (?:earned|won) leg \d+\b/i.test(displayText);
}
