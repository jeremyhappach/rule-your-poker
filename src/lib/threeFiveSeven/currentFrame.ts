export interface ThreeFiveSevenFrameIdentity {
  dealer_game_id: string | null;
  hand_number: number | null;
  round_number: number | null;
  round_id: string | null;
  opening_transfer_required: boolean;
  opening_transfer_cursor: number | null;
  chip_transfer_cursor: number;
}

export interface ThreeFiveSevenCurrentFrame<
  TGame extends Record<string, unknown> = Record<string, unknown>,
  TRound extends Record<string, unknown> = Record<string, unknown>,
  TPlayer extends Record<string, unknown> = Record<string, unknown>,
> {
  game: TGame;
  round: TRound | null;
  players: TPlayer[];
  playerCards: Array<{ player_id: string; cards: unknown[] }>;
  viewerPlayerId: string | null;
  viewerCardsRequired: boolean;
  viewerCardsPresent: boolean;
  identity: ThreeFiveSevenFrameIdentity;
  decisionReveal: ThreeFiveSevenDecisionRevealWindow | null;
  serverNow: string;
}

export interface ThreeFiveSevenFrameCursor {
  requestSequence: number;
  status: string;
  dealerGameId: string | null;
  handNumber: number | null;
  roundNumber: number | null;
  roundId: string | null;
}

export type ThreeFiveSevenFrameAcceptance =
  | { accepted: true; reason: 'first_frame' | 'newer_request' | 'forward_active_identity' | 'same_active_identity' }
  | { accepted: false; reason: 'older_request' | 'regressive_active_identity' | 'conflicting_active_round_id' | 'regressive_active_lifecycle' };

export function isThreeFiveSevenGameType(gameType: unknown): boolean {
  return gameType === '3-5-7' || gameType === '3-5-7-game' || gameType === '357';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  const parsed = nullableInteger(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

/**
 * Validate the RPC envelope before any React state writer sees it. An active
 * frame is admitted only when the game pointer, exact round, and the caller's
 * complete private hand all agree inside the same PostgreSQL snapshot.
 */
export function parseThreeFiveSevenCurrentFrame<
  TGame extends Record<string, unknown>,
  TRound extends Record<string, unknown>,
  TPlayer extends Record<string, unknown>,
>(raw: unknown): ThreeFiveSevenCurrentFrame<TGame, TRound, TPlayer> {
  if (!isRecord(raw) || !isRecord(raw.game) || !Array.isArray(raw.players) || !Array.isArray(raw.player_cards) || !isRecord(raw.identity)) {
    throw new Error('three_five_seven_current_frame:malformed_envelope');
  }

  const game = raw.game as TGame;
  const round = raw.round == null ? null : (isRecord(raw.round) ? raw.round as TRound : null);
  if (raw.round != null && !round) throw new Error('three_five_seven_current_frame:malformed_round');
  if (!raw.players.every(isRecord)) throw new Error('three_five_seven_current_frame:malformed_players');

  const playerCards = raw.player_cards.map((row) => {
    if (!isRecord(row) || typeof row.player_id !== 'string' || !Array.isArray(row.cards)) {
      throw new Error('three_five_seven_current_frame:malformed_player_cards');
    }
    return { player_id: row.player_id, cards: row.cards };
  });

  const rawOpeningTransferCursor = raw.identity.opening_transfer_cursor;
  const openingTransferCursor = nullablePositiveInteger(rawOpeningTransferCursor);
  if (rawOpeningTransferCursor != null && openingTransferCursor == null) {
    throw new Error('three_five_seven_current_frame:malformed_opening_transfer_cursor');
  }
  if (typeof raw.identity.opening_transfer_required !== 'boolean') {
    throw new Error('three_five_seven_current_frame:malformed_opening_transfer_required');
  }
  const identity: ThreeFiveSevenFrameIdentity = {
    dealer_game_id: nullableString(raw.identity.dealer_game_id),
    hand_number: nullableInteger(raw.identity.hand_number),
    round_number: nullableInteger(raw.identity.round_number),
    round_id: nullableString(raw.identity.round_id),
    opening_transfer_required: raw.identity.opening_transfer_required,
    opening_transfer_cursor: openingTransferCursor,
    chip_transfer_cursor: nullableInteger(raw.identity.chip_transfer_cursor) ?? 0,
  };
  const gameDealerGameId = nullableString(game.current_game_uuid);
  const gameHandNumber = nullableInteger(game.total_hands);
  const gameRoundNumber = nullableInteger(game.current_round);
  if (
    identity.dealer_game_id !== gameDealerGameId
    || identity.hand_number !== gameHandNumber
    || identity.round_number !== gameRoundNumber
  ) {
    throw new Error('three_five_seven_current_frame:game_identity_mismatch');
  }

  const status = typeof game.status === 'string' ? game.status : '';
  const sessionTerminalIdentityPresent = status === 'session_ended' && (
    !!gameDealerGameId
    || (gameHandNumber != null && gameHandNumber > 0)
    || gameRoundNumber != null
  );
  const terminalIdentityRequired = status === 'game_over' || sessionTerminalIdentityPresent;
  const active = status === 'in_progress' || status === 'game_over' || sessionTerminalIdentityPresent;
  if (
    terminalIdentityRequired
    && (!gameDealerGameId || gameHandNumber == null || gameHandNumber < 1 || gameRoundNumber == null)
  ) {
    throw new Error('three_five_seven_current_frame:terminal_round_identity_missing');
  }
  if (active && gameDealerGameId && gameHandNumber != null && gameRoundNumber != null && !round) {
    throw new Error('three_five_seven_current_frame:exact_round_missing');
  }
  if (round) {
    const roundOpeningTransferCursor = nullablePositiveInteger(
      round.three_five_seven_opening_transfer_cursor,
    );
    const roundOpeningTransferRequired = round.three_five_seven_opening_transfer_required;
    if (
      round.three_five_seven_opening_transfer_cursor != null
      && roundOpeningTransferCursor == null
    ) {
      throw new Error('three_five_seven_current_frame:malformed_round_opening_transfer_cursor');
    }
    if (typeof roundOpeningTransferRequired !== 'boolean') {
      throw new Error('three_five_seven_current_frame:malformed_round_opening_transfer_required');
    }
    if (
      nullableString(round.id) !== identity.round_id
      || nullableString(round.dealer_game_id) !== gameDealerGameId
      || nullableInteger(round.hand_number) !== gameHandNumber
      || nullableInteger(round.round_number) !== gameRoundNumber
    ) {
      throw new Error('three_five_seven_current_frame:round_identity_mismatch');
    }
    if (roundOpeningTransferCursor !== identity.opening_transfer_cursor) {
      throw new Error('three_five_seven_current_frame:opening_transfer_claim_mismatch');
    }
    if (roundOpeningTransferRequired !== identity.opening_transfer_required) {
      throw new Error('three_five_seven_current_frame:opening_transfer_requirement_mismatch');
    }
    if (
      (identity.opening_transfer_required && identity.opening_transfer_cursor == null)
      || (!identity.opening_transfer_required && identity.opening_transfer_cursor !== null)
    ) {
      throw new Error('three_five_seven_current_frame:opening_transfer_requirement_invalid');
    }
    if (
      gameRoundNumber !== 1
      && (identity.opening_transfer_required || identity.opening_transfer_cursor !== null)
    ) {
      throw new Error('three_five_seven_current_frame:opening_transfer_claim_on_nonopening_round');
    }
  } else if (identity.round_id !== null) {
    throw new Error('three_five_seven_current_frame:orphan_round_identity');
  }

  const viewerPlayerId = nullableString(raw.viewer_player_id);
  const viewerCardsRequired = raw.viewer_cards_required === true;
  const viewerCardsPresent = raw.viewer_cards_present === true;
  if (viewerCardsRequired) {
    const viewerRow = viewerPlayerId
      ? playerCards.find((row) => row.player_id === viewerPlayerId)
      : null;
    const expectedCount = round ? nullableInteger(round.cards_dealt) : null;
    if (!viewerCardsPresent || !viewerRow || expectedCount == null || viewerRow.cards.length !== expectedCount) {
      throw new Error('three_five_seven_current_frame:incomplete_viewer_hand');
    }
  }

  const decisionReveal = parseThreeFiveSevenDecisionRevealWindow(raw.decision_reveal);
  if (typeof raw.server_now !== 'string' || !Number.isFinite(Date.parse(raw.server_now))) {
    throw new Error('three_five_seven_current_frame:malformed_server_now');
  }
  if (
    decisionReveal
    && (
      decisionReveal.gameId !== nullableString(game.id)
      || decisionReveal.dealerGameId !== identity.dealer_game_id
      || decisionReveal.roundId !== identity.round_id
      || decisionReveal.handNumber !== identity.hand_number
      || decisionReveal.roundNumber !== identity.round_number
    )
  ) {
    throw new Error('three_five_seven_current_frame:decision_reveal_identity_mismatch');
  }

  return {
    game,
    round,
    players: raw.players as TPlayer[],
    playerCards,
    viewerPlayerId,
    viewerCardsRequired,
    viewerCardsPresent,
    identity,
    decisionReveal,
    serverNow: raw.server_now,
  };
}

export function frameCursor(
  frame: ThreeFiveSevenCurrentFrame,
  requestSequence: number,
): ThreeFiveSevenFrameCursor {
  return {
    requestSequence,
    status: typeof frame.game.status === 'string' ? frame.game.status : '',
    dealerGameId: frame.identity.dealer_game_id,
    handNumber: frame.identity.hand_number,
    roundNumber: frame.identity.round_number,
    roundId: frame.identity.round_id,
  };
}

/**
 * Request sequence prevents a slow older request from replacing a newer
 * dealer game. Within one live dealer game, exact hand/round identity is also
 * monotonic so even a surprising regressive database projection fails closed.
 */
export function acceptThreeFiveSevenFrame(
  current: ThreeFiveSevenFrameCursor | null,
  incoming: ThreeFiveSevenFrameCursor,
): ThreeFiveSevenFrameAcceptance {
  if (!current) return { accepted: true, reason: 'first_frame' };
  if (incoming.requestSequence < current.requestSequence) {
    return { accepted: false, reason: 'older_request' };
  }

  const currentActive = current.status === 'in_progress'
    || current.status === 'game_over'
    || (current.status === 'session_ended' && !!current.dealerGameId);
  const incomingActive = incoming.status === 'in_progress'
    || incoming.status === 'game_over'
    || (incoming.status === 'session_ended' && !!incoming.dealerGameId);
  const sameDealerGame = !!incoming.dealerGameId && incoming.dealerGameId === current.dealerGameId;
  const incomingPregame = incoming.status === 'waiting'
    || incoming.status === 'dealer_selection'
    || incoming.status === 'dealer_announcement'
    || incoming.status === 'game_selection'
    || incoming.status === 'configuring'
    || incoming.status === 'ante_decision';
  if (
    currentActive
    && incomingPregame
    && (!incoming.dealerGameId || incoming.dealerGameId === current.dealerGameId)
  ) {
    return { accepted: false, reason: 'regressive_active_lifecycle' };
  }
  if (currentActive && incomingActive && sameDealerGame) {
    const currentHand = current.handNumber ?? -1;
    const incomingHand = incoming.handNumber ?? -1;
    const currentRound = current.roundNumber ?? -1;
    const incomingRound = incoming.roundNumber ?? -1;
    if (incomingHand < currentHand || (incomingHand === currentHand && incomingRound < currentRound)) {
      return { accepted: false, reason: 'regressive_active_identity' };
    }
    if (incomingHand === currentHand && incomingRound === currentRound) {
      if (incoming.roundId !== current.roundId) {
        return { accepted: false, reason: 'conflicting_active_round_id' };
      }
      return { accepted: true, reason: 'same_active_identity' };
    }
    return { accepted: true, reason: 'forward_active_identity' };
  }

  return { accepted: true, reason: 'newer_request' };
}

/** Exact means exact: a standalone successor INSERT never advances the view. */
export function selectExactThreeFiveSevenRound<TRound extends {
  id: string;
  dealer_game_id?: string | null;
  hand_number?: number | null;
  round_number: number;
}>(
  rounds: TRound[] | undefined,
  identity: { dealerGameId: string | null | undefined; handNumber: number | null | undefined; roundNumber: number | null | undefined },
): TRound | null {
  if (!rounds || !identity.dealerGameId || typeof identity.handNumber !== 'number' || typeof identity.roundNumber !== 'number') {
    return null;
  }
  const matches = rounds.filter((round) =>
    round.dealer_game_id === identity.dealerGameId
    && round.hand_number === identity.handNumber
    && round.round_number === identity.roundNumber
  );
  return matches.length === 1 ? matches[0] : null;
}
import {
  parseThreeFiveSevenDecisionRevealWindow,
  type ThreeFiveSevenDecisionRevealWindow,
} from './decisionReveal';
