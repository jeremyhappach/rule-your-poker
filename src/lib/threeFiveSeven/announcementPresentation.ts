import type { ChipPresentationCursorState } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  getThreeFiveSevenAllFoldPresentationKey,
  type ThreeFiveSevenAllFoldPresentation,
} from './allFoldPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

export interface ThreeFiveSevenCursorAnnouncement {
  id: string;
  scope: string;
  text: 'Pussy Tax!' | 'Re-Ante';
}

type ThreeFiveSevenTransferPresentation =
  | ThreeFiveSevenAllFoldPresentation
  | ThreeFiveSevenRolloverPresentation;

const isVisibleTransferState = (state: ChipPresentationCursorState): boolean =>
  state === 'running';

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

export function getThreeFiveSevenPussyTaxAnnouncement(
  presentation: ThreeFiveSevenAllFoldPresentation | null | undefined,
  cursorState: ChipPresentationCursorState,
): ThreeFiveSevenCursorAnnouncement | null {
  if (
    !presentation
    || presentation.transferCursor == null
    || !isVisibleTransferState(cursorState)
  ) return null;

  const scope = getThreeFiveSevenPussyTaxAnnouncementScope(presentation);
  return {
    id: `round_win:${scope}`,
    scope,
    text: 'Pussy Tax!',
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

export function getThreeFiveSevenReAnteAnnouncement(
  presentation: ThreeFiveSevenRolloverPresentation | null | undefined,
  cursorState: ChipPresentationCursorState,
): ThreeFiveSevenCursorAnnouncement | null {
  // H1/R1 is the opening ante. Only a later hand's R3 -> R1 transfer is a
  // re-ante, even though both use the same exact rollover identity shape.
  if (
    !presentation
    || presentation.handNumber <= 1
    || !isVisibleTransferState(cursorState)
  ) return null;

  const scope = getThreeFiveSevenReAnteAnnouncementScope(presentation);
  return {
    id: `peg:${scope}`,
    scope,
    text: 'Re-Ante',
  };
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
