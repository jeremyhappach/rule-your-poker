export interface ThreeFiveSevenRolloverPresentation {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: 1;
  openingTransferRequired: boolean;
  transferCursor: number | null;
}

interface CurrentThreeFiveSevenRolloverIdentity {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  roundNumber: number | null | undefined;
  openingTransferRequired: boolean | null | undefined;
  openingTransferCursor: number | null | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function asNullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asPositiveInteger(value) ?? undefined;
}

export function isThreeFiveSevenGameType(gameType: string | null | undefined): boolean {
  return gameType === '3-5-7' || gameType === '3-5-7-game' || gameType === '357';
}

/**
 * Consume the committed RPC result rather than waiting for the initiating
 * browser to receive its own Realtime event. Every new-hand Round 1 result,
 * including H1, needs an exact game/dealer-game/round/hand identity before
 * presentation can admit the deal.
 */
export function parseThreeFiveSevenRolloverAdvanceResult(
  expectedGameId: string,
  value: unknown,
): ThreeFiveSevenRolloverPresentation | null {
  if (!isRecord(value) || !isRecord(value.game) || !isRecord(value.round)) return null;

  const resultGameId = typeof value.game.id === 'string' ? value.game.id : null;
  const dealerGameId = typeof value.game.current_game_uuid === 'string'
    ? value.game.current_game_uuid
    : null;
  const roundId = typeof value.round.id === 'string' ? value.round.id : null;
  const roundDealerGameId = typeof value.round.dealer_game_id === 'string'
    ? value.round.dealer_game_id
    : null;
  const handNumber = asPositiveInteger(value.round.hand_number);
  const roundNumber = asPositiveInteger(value.round.round_number);
  const resultHandNumber = asPositiveInteger(value.hand_number);
  const resultRoundNumber = asPositiveInteger(value.round_number);
  const openingTransferRequired = value.opening_transfer_required;
  const resultOpeningTransferCursor = asNullablePositiveInteger(value.opening_transfer_cursor);
  const roundOpeningTransferCursor = asNullablePositiveInteger(
    value.round.three_five_seven_opening_transfer_cursor,
  );

  if (
    resultGameId !== expectedGameId
    || !dealerGameId
    || roundDealerGameId !== dealerGameId
    || !roundId
    || handNumber == null
    || roundNumber !== 1
    || resultHandNumber !== handNumber
    || resultRoundNumber !== roundNumber
    || typeof openingTransferRequired !== 'boolean'
    || resultOpeningTransferCursor === undefined
    || roundOpeningTransferCursor === undefined
    || (openingTransferRequired
      ? resultOpeningTransferCursor == null
        || roundOpeningTransferCursor !== resultOpeningTransferCursor
      : resultOpeningTransferCursor !== null || roundOpeningTransferCursor !== null)
  ) return null;

  return {
    gameId: expectedGameId,
    dealerGameId,
    roundId,
    handNumber,
    roundNumber: 1,
    openingTransferRequired,
    transferCursor: roundOpeningTransferCursor,
  };
}

function matchesCurrentIdentity(
  presentation: ThreeFiveSevenRolloverPresentation,
  current: CurrentThreeFiveSevenRolloverIdentity,
): boolean {
  return presentation.gameId === current.gameId
    && presentation.dealerGameId === current.dealerGameId
    && presentation.roundId === current.roundId
    && presentation.handNumber === current.handNumber
    && presentation.roundNumber === current.roundNumber;
}

/**
 * The initiating client prefers the exact RPC result. Peers reconstruct the
 * same exact identity from the committed game + round refetch. A stale direct
 * result is never allowed to cross a later hand or dealer-game boundary.
 */
export function selectThreeFiveSevenRolloverPresentation(
  directResult: ThreeFiveSevenRolloverPresentation | null,
  current: CurrentThreeFiveSevenRolloverIdentity,
): ThreeFiveSevenRolloverPresentation | null {
  if (
    !current.gameId
    || !isThreeFiveSevenGameType(current.gameType)
    || !current.dealerGameId
    || !current.roundId
    || current.handNumber == null
    || current.roundNumber !== 1
    || typeof current.openingTransferRequired !== 'boolean'
  ) return null;

  const transferCursor = asNullablePositiveInteger(current.openingTransferCursor);
  if (
    transferCursor === undefined
    || (current.openingTransferRequired && transferCursor == null)
    || (!current.openingTransferRequired && transferCursor !== null)
  ) return null;
  if (
    directResult
    && matchesCurrentIdentity(directResult, current)
    && directResult.openingTransferRequired === current.openingTransferRequired
    && directResult.transferCursor === transferCursor
  ) return directResult;

  return {
    gameId: current.gameId,
    dealerGameId: current.dealerGameId,
    roundId: current.roundId,
    handNumber: current.handNumber,
    roundNumber: 1,
    openingTransferRequired: current.openingTransferRequired,
    transferCursor,
  };
}

export function isThreeFiveSevenRolloverCursorReleased(
  presentation: ThreeFiveSevenRolloverPresentation | null | undefined,
  cursorState: ChipPresentationCursorState,
): boolean {
  return !!presentation
    && (!presentation.openingTransferRequired
      || cursorState === 'settled'
      || cursorState === 'reconciled');
}
import type { ChipPresentationCursorState } from '@/lib/canonicalShell/ChipPresentationLedger';
