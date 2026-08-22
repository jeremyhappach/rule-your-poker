import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';

export interface ThreeFiveSevenShowdownPresentation {
  key: string;
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: number;
  transferCursor: number;
  result: string;
  revealAtShowdown: boolean;
  stayedPlayerIds: string[];
}

interface ThreeFiveSevenShowdownPresentationInput {
  gameId: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  roundNumber: number | null | undefined;
  transferCursor: number | null | undefined;
  result: string | null | undefined;
  revealAtShowdown: boolean;
  stayedPlayerIds: readonly string[];
  roundCompleted: boolean;
}

/**
 * Capture the exact atomic 3-5-7 result frame that owns showdown pacing.
 * Financial truth remains in the immutable transfer batch; this descriptor
 * only decides when that already-committed batch and result may paint.
 */
export function buildThreeFiveSevenShowdownPresentation({
  gameId,
  dealerGameId,
  roundId,
  handNumber,
  roundNumber,
  transferCursor,
  result,
  revealAtShowdown,
  stayedPlayerIds,
  roundCompleted,
}: ThreeFiveSevenShowdownPresentationInput): ThreeFiveSevenShowdownPresentation | null {
  const uniqueStayers = [...new Set(stayedPlayerIds.filter(Boolean))].sort();
  const trimmedResult = result?.trim() ?? '';
  if (
    !roundCompleted
    || !gameId
    || !dealerGameId
    || !roundId
    || !Number.isInteger(handNumber)
    || handNumber! < 1
    || !Number.isInteger(roundNumber)
    || roundNumber! < 1
    || !Number.isInteger(transferCursor)
    || transferCursor! < 0
    || !trimmedResult
    || uniqueStayers.length < 2
  ) {
    return null;
  }

  const key = [
    gameId,
    dealerGameId,
    roundId,
    `h${handNumber}`,
    `r${roundNumber}`,
    `cursor:${transferCursor}`,
    `reveal:${revealAtShowdown ? 'on' : 'off'}`,
    uniqueStayers.join(','),
    trimmedResult,
  ].join('|');

  return {
    key,
    gameId,
    dealerGameId,
    roundId,
    handNumber: handNumber!,
    roundNumber: roundNumber!,
    transferCursor: transferCursor!,
    result: trimmedResult,
    revealAtShowdown,
    stayedPlayerIds: uniqueStayers,
  };
}

export function isThreeFiveSevenShowdownPresentationReady(
  presentation: ThreeFiveSevenShowdownPresentation,
  delayedPresentationKey: string | null | undefined,
): boolean {
  return !presentation.revealAtShowdown
    || delayedPresentationKey === presentation.key;
}

/**
 * Reports the visual boundary that starts the reading dwell. In rounds 1-2,
 * a player who did not stay cannot see the private proof cards, so that client
 * starts the same dwell from the result boundary instead of waiting on a face
 * it is not permitted to paint. Round 3 and stayed viewers wait for every
 * visible opposing stayer face.
 */
export function isThreeFiveSevenOpponentRevealBoundaryReady({
  presentation,
  viewerPlayerId,
  viewerStayed,
  faceReadyPlayerIds,
}: {
  presentation: ThreeFiveSevenShowdownPresentation | null | undefined;
  viewerPlayerId: string | null | undefined;
  viewerStayed: boolean;
  faceReadyPlayerIds: readonly string[];
}): boolean {
  if (!presentation?.revealAtShowdown) return false;
  if (presentation.roundNumber < 3 && !viewerStayed) return true;

  const ready = new Set(faceReadyPlayerIds);
  const opponents = presentation.stayedPlayerIds.filter(
    (playerId) => playerId !== viewerPlayerId,
  );
  return opponents.length > 0 && opponents.every((playerId) => ready.has(playerId));
}

/**
 * Returns null for unrelated batches. Current database authority labels a
 * showdown payment `win`; `transfer` remains accepted for an in-flight legacy
 * result. Either form fails closed until its exact atomic result frame owns the
 * current cursor and, when configured, its reveal-reading dwell has completed.
 */
export function getThreeFiveSevenShowdownTransferAdmission(
  batch: Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'>,
  presentation: ThreeFiveSevenShowdownPresentation | null | undefined,
  delayedPresentationKey: string | null | undefined,
): boolean | null {
  const hasPlayerToPlayer = batch.transfers.some(
    (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'player',
  );
  if (!hasPlayerToPlayer || (batch.reason !== 'win' && batch.reason !== 'transfer')) {
    return null;
  }

  const isPurePlayerToPlayer = batch.transfers.every(
    (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'player',
  );
  if (!isPurePlayerToPlayer || !presentation || batch.cursor !== presentation.transferCursor) {
    return false;
  }

  return isThreeFiveSevenShowdownPresentationReady(
    presentation,
    delayedPresentationKey,
  );
}
