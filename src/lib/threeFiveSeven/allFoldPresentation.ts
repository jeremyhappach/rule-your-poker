export interface ThreeFiveSevenAllFoldPresentation {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: number;
  transferCursor: number | null;
}

interface ThreeFiveSevenAllFoldAuthoritySnapshot {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  roundNumber: number | null | undefined;
  roundStatus: string | null | undefined;
  awaitingNextRound: boolean | null | undefined;
  lastRoundResult: string | null | undefined;
  pussyTaxEnabled: boolean | null | undefined;
  pussyTaxValue: number | null | undefined;
  transferCursor: number | null | undefined;
}

const is357GameType = (value: unknown) =>
  value === '3-5-7' || value === '3-5-7-game' || value === '357';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export function getThreeFiveSevenAllFoldPresentationKey(
  presentation: ThreeFiveSevenAllFoldPresentation,
): string {
  return [
    presentation.gameId,
    presentation.dealerGameId,
    presentation.roundId,
    presentation.handNumber,
    presentation.roundNumber,
    presentation.transferCursor ?? 'no-transfer',
  ].join('|');
}

export function parseThreeFiveSevenAllFoldDecisionResult(
  expectedGameId: string,
  value: unknown,
): ThreeFiveSevenAllFoldPresentation | null {
  const root = asRecord(value);
  const resolution = asRecord(root?.resolution);
  const committedGame = asRecord(root?.game);
  const committedRound = asRecord(root?.round);
  if (!root || !resolution || !committedGame || !committedRound) return null;
  if (resolution.outcome !== 'all_fold' || resolution.presentation_kind !== 'pussy_tax') return null;

  const dealerGameId = typeof resolution.dealer_game_id === 'string'
    ? resolution.dealer_game_id
    : null;
  const roundId = typeof resolution.round_id === 'string' ? resolution.round_id : null;
  const handNumber = asPositiveInteger(resolution.hand_number);
  const roundNumber = asPositiveInteger(resolution.round_number);
  const cursor = resolution.presentation_transfer_cursor == null
    ? null
    : asPositiveInteger(resolution.presentation_transfer_cursor);
  if (!dealerGameId || !roundId || handNumber == null || roundNumber == null) return null;
  if (resolution.presentation_transfer_cursor != null && cursor == null) return null;

  const exactCommittedGame = committedGame.id === expectedGameId
    && committedGame.current_game_uuid === dealerGameId
    && committedGame.total_hands === handNumber
    && committedGame.current_round === roundNumber
    && committedGame.awaiting_next_round === true
    && committedGame.last_round_result === 'All players folded';
  const exactCommittedRound = committedRound.id === roundId
    && committedRound.dealer_game_id === dealerGameId
    && committedRound.hand_number === handNumber
    && committedRound.round_number === roundNumber
    && committedRound.status === 'completed';
  if (!exactCommittedGame || !exactCommittedRound) return null;

  return {
    gameId: expectedGameId,
    dealerGameId,
    roundId,
    handNumber,
    roundNumber,
    transferCursor: cursor,
  };
}

export function deriveThreeFiveSevenAllFoldPresentation(
  snapshot: ThreeFiveSevenAllFoldAuthoritySnapshot,
): ThreeFiveSevenAllFoldPresentation | null {
  if (!snapshot.gameId || !is357GameType(snapshot.gameType)) return null;
  if (!snapshot.dealerGameId || !snapshot.roundId) return null;
  if (!snapshot.awaitingNextRound || snapshot.lastRoundResult !== 'All players folded') return null;
  if (snapshot.roundStatus !== 'completed') return null;
  const handNumber = asPositiveInteger(snapshot.handNumber);
  const roundNumber = asPositiveInteger(snapshot.roundNumber);
  if (handNumber == null || roundNumber == null) return null;

  const taxExpected = snapshot.pussyTaxEnabled !== false && (snapshot.pussyTaxValue ?? 0) > 0;
  const transferCursor = asPositiveInteger(snapshot.transferCursor);
  if (taxExpected && transferCursor == null) return null;

  return {
    gameId: snapshot.gameId,
    dealerGameId: snapshot.dealerGameId,
    roundId: snapshot.roundId,
    handNumber,
    roundNumber,
    transferCursor: taxExpected ? transferCursor : null,
  };
}

export function selectThreeFiveSevenAllFoldPresentation(
  direct: ThreeFiveSevenAllFoldPresentation | null | undefined,
  authoritative: ThreeFiveSevenAllFoldPresentation | null | undefined,
): ThreeFiveSevenAllFoldPresentation | null {
  if (!authoritative) return null;
  if (
    direct
    && direct.gameId === authoritative.gameId
    && direct.dealerGameId === authoritative.dealerGameId
    && direct.roundId === authoritative.roundId
    && direct.handNumber === authoritative.handNumber
    && direct.roundNumber === authoritative.roundNumber
  ) {
    return direct;
  }
  return authoritative;
}
