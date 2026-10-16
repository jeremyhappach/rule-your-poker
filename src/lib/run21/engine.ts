import { assertConfig, isUuid, SCORE_PRESENTATION_MS, type Match, type Identity, type Config, type Player, type Round, type Board, type Command, type Principal, type DeckEvidence, type RoundEvidence, type Frame, type Projection, type SettlementIntent, type SettlementReceipt } from './model.js';
import { aggregate, cardKey, duration, legalColumns, canFinish, isPerfectBoard, speedAt, standardDeck, total, multiplierAt, scoreBoard } from './rules.js';
import {turnReleaseAt} from './roundIntro.js';

function clock(match: Match, at: number) {
  if (!Number.isSafeInteger(at) || at < match.updatedAt) throw new Error('non_monotonic_authority_clock');
}
export function frameOf(match: Match): Frame {
  const round = match.rounds.at(-1);
  return structuredClone({ identity: match.identity, config: match.config, players: match.players, stake: match.stake,
    ...(match.automaticPlayers ? {automaticPlayers: match.automaticPlayers} : {}),
    ...(match.pausedAt !== undefined ? {pausedAt: match.pausedAt} : {}),
    roundId: round?.id ?? null, roundNumber: round?.number ?? 0,
    commitment: round && !('version' in round.secret) ? round.secret.commitment : null,
    ...(match.dealingVersion === 2 ? {dealingVersion: 2 as const,
      commitments: round && 'version' in round.secret ? Object.fromEntries(Object.entries(round.secret.decks).map(([id, deck]) => [id, deck.commitment])) : {}} : {}),
    active_player_id: round?.active_player_id ?? null,
    liveBoards: round?.liveBoards ?? false, scorePresentation: round?.scorePresentation ?? null,
    boards: round?.boards ?? {}, revealed: round?.revealed ?? false, acknowledged: round?.acknowledged ?? [],
    cumulative: match.cumulative, winnerId: match.winnerId, settlement: match.settlement });
}
export function redactFrame(frame: Frame, viewerId: string | null, revealed = frame.revealed): Projection {
  if (viewerId !== null && !frame.players.some(p => p.id === viewerId)) throw new Error('unauthorized_viewer');
  return { ...structuredClone(frame), viewerId,
    passUsed: Object.fromEntries(Object.entries(frame.boards).map(([id, board]) => [id, board.passesUsed >= frame.config.passes])),
    playStatus: Object.fromEntries(Object.entries(frame.boards).map(([id, board]) => [id, board.result?'finished':id===frame.active_player_id?'playing':'waiting'])),
    boards: Object.fromEntries(Object.entries(frame.boards).map(([id, board]) =>
    [id, revealed || id === viewerId || (frame.liveBoards && board.presented.length > 0) ? structuredClone(board) : null])) };
}
export const project = (match: Match, viewerId: string | null): Projection => redactFrame(frameOf(match), viewerId);
function event(match: Match, type: string, at: number, actorId: string | null = null, requestId: string | null = null, operands: Record<string, unknown> = {}) {
  match.updatedAt = at;
  match.eventSequence = (match.eventSequence ?? match.events.at(-1)?.sequence ?? 0) + 1;
  match.events.push({ sequence: match.eventSequence, type, at, roundId: match.rounds.at(-1)?.id ?? null,
    actorId, requestId, operands: structuredClone(operands), frame: frameOf(match) });
}
export function createMatch(identity: Identity, players: Player[], stake: number, config: Config, at: number, dealingVersion: 1 | 2 = 2): Match {
  assertConfig(config);
  if (!isUuid(identity.sessionId) || !isUuid(identity.dealerGameId) || !Number.isSafeInteger(identity.handNumber) || identity.handNumber < 1 ||
      players.length !== 2 || players.some(p => !isUuid(p.id) || !Number.isSafeInteger(p.seat) || p.seat < 0) ||
      new Set(players.map(p => p.id)).size !== 2 || new Set(players.map(p => p.seat)).size !== 2 ||
      !Number.isSafeInteger(stake) || stake < 0 || !Number.isSafeInteger(at) || at < 0) throw new Error('invalid_match');
  const match: Match = structuredClone({ identity, players, stake, config, rounds: [], ...(dealingVersion === 2 ? {dealingVersion: 2 as const} : {}),
    cumulative: Object.fromEntries(players.map(p => [p.id, 0])), winnerId: null, settlement: null, receipts: {}, events: [], updatedAt: at });
  event(match, 'match_created', at);
  return match;
}
/** Trusted server entry point. The future persistence adapter locks match identity first. */
export function prepareRound(input: Match, id: string, predecessorId: string | null, deck: RoundEvidence, at: number): Match {
  const prior = input.rounds.at(-1);
  const existing = input.rounds.find(r => r.id === id);
  if (existing) {
    const previous = input.rounds[existing.number - 2]?.id ?? null;
    if (previous !== predecessorId || JSON.stringify(existing.secret) !== JSON.stringify(deck)) throw new Error('round_identity_conflict');
    return input;
  }
  clock(input, at);
  if (!isUuid(id) || (prior?.id ?? null) !== predecessorId || input.winnerId ||
      (prior && (!prior.revealed || prior.acknowledged.length !== input.players.length))) throw new Error('round_boundary');
  if (input.dealingVersion === 2) {
    if (!('version' in deck) || deck.version !== 2 || Object.keys(deck.decks).length !== input.players.length) throw new Error('deck_version_conflict');
    for (const player of input.players) {
      const evidence = deck.decks[player.id];
      if (!evidence || evidence.playerId !== player.id || evidence.roundId !== id ||
          evidence.identity.sessionId !== input.identity.sessionId || evidence.identity.dealerGameId !== input.identity.dealerGameId ||
          evidence.identity.handNumber !== input.identity.handNumber) throw new Error('deck_identity_conflict');
      validateDeck(evidence);
    }
  } else {
    if ('version' in deck) throw new Error('deck_version_conflict');
    validateDeck(deck);
  }
  const match = structuredClone(input);
  // Persisted participant order is canonical for every round.
  const starter = match.players[0].id;
  const round: Round = { id, number: match.rounds.length + 1, secret: structuredClone(deck), revealed: false, acknowledged: [],
    starting_player_id: starter, active_player_id: starter,
    liveBoards: true, scorePresentation: null,
    boards: Object.fromEntries(match.players.map(p => [p.id, { playerId: p.id, columns: Array.from({length: match.config.columns}, () => []),
      passesUsed: 0, presented: [], current: null, cardIndex: 0, revision: 0, startedAt: null, deadline: null, result: null }])) };
  match.rounds.push(round);
  event(match, 'round_prepared', at);
  return match;
}
function startTurn(match: Match, round: Round, board: Board, at: number, requestId: string) {
  round.active_player_id = board.playerId;
  if (match.config.firstPlacementSeconds !== undefined)
    board.firstPlacementDeadline = at + (match.config.roundIntroMs ?? 0) + match.config.firstPlacementSeconds * 1000;
  board.revision++;
  event(match, 'turn_started', at, null, requestId, {active_player_id: board.playerId});
  present(match, round, board, at, requestId);
}
function finish(match: Match, round: Round, board: Board, reason: NonNullable<Board['result']>['reason'], at: number, requestId: string, transferAt = at) {
  board.result = scoreBoard(board, match.config, reason, at);
  round.active_player_id = null;
  const from = match.cumulative[board.playerId];
  match.cumulative[board.playerId] += board.result.score;
  round.scorePresentation = {playerId: board.playerId, startedAt: transferAt, endsAt: transferAt + SCORE_PRESENTATION_MS,
    from, to: match.cumulative[board.playerId]};
  event(match, reason, at, board.playerId, requestId, { result: board.result });
  event(match, 'score_presentation_started', transferAt, board.playerId, requestId, {presentation: round.scorePresentation});
}
/** Persisted presentation deadline: reconnects and server restarts cannot skip or duplicate scoring. */
export function advanceScorePresentation(input: Match, at: number): Match {
  const phase = input.rounds.at(-1)?.scorePresentation;
  if (!phase || at < phase.endsAt) return input;
  clock(input, at);
  const match = structuredClone(input), round = match.rounds.at(-1)!;
  round.scorePresentation = null;
  event(match, 'score_presentation_completed', at, phase.playerId);
  if (Object.values(round.boards).every(b => b.result) && !round.revealed) {
    round.revealed = true;
    if (round.number >= match.config.rounds) {
      const [a, b] = match.players;
      if (match.cumulative[a.id] !== match.cumulative[b.id]) match.winnerId = match.cumulative[a.id] > match.cumulative[b.id] ? a.id : b.id;
    }
    event(match, 'round_revealed', at);
    if (match.winnerId) event(match, 'match_decided', at, null, null, { settlementIntent: settlementIntent(match) });
  } else {
    const next = Object.values(round.boards).find(b => !b.result)!;
    startTurn(match, round, next, at, `turn:${round.id}:${next.playerId}`);
  }
  return match;
}
function present(match: Match, round: Round, board: Board, at: number, requestId: string) {
  const deck = deckForPlayer(match, round, board.playerId);
  board.current = deck.cards[board.cardIndex] ?? null;
  if (board.current) {
    board.presented.push(structuredClone(board.current));
    event(match, 'card_presented', at, board.playerId, requestId, {card: board.current, cardIndex: board.cardIndex});
  } else finish(match, round, board, 'exhausted', at, requestId);
}
function validateDeck(deck: DeckEvidence) {
  const expected = new Set(standardDeck().map(cardKey));
  if (deck.cards.length !== expected.size || new Set(deck.cards.map(cardKey)).size !== expected.size ||
      deck.cards.some(c => !expected.has(cardKey(c))) || !/^[0-9a-f]{64}$/.test(deck.commitment) || !/^[0-9a-f]{64}$/.test(deck.salt)) throw new Error('invalid_deck_evidence');
}
/** Private selection also rejects a swapped persisted player/round identity. */
export function deckForPlayer(match: Match, round: Round, playerId: string): DeckEvidence {
  if (match.dealingVersion !== 2) {
    if ('version' in round.secret) throw new Error('deck_version_conflict');
    return round.secret;
  }
  if (!('version' in round.secret) || round.secret.version !== 2) throw new Error('deck_version_conflict');
  const deck = round.secret.decks[playerId];
  if (!deck || deck.playerId !== playerId || deck.roundId !== round.id || deck.identity.sessionId !== match.identity.sessionId ||
      deck.identity.dealerGameId !== match.identity.dealerGameId || deck.identity.handNumber !== match.identity.handNumber) throw new Error('deck_identity_conflict');
  return deck;
}
export interface ActionResult { state: Match; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }
/** Pure transactional specification. Only an authenticated server supplies principal and at. */
export function applyCommand(input: Match, command: Command, principal: Principal, at: number): ActionResult {
  const reject = (reason: string): ActionResult => ({ state: input, status: 'rejected', reason });
  if (input.pausedAt != null) return reject('paused');
  if (principal.kind === 'player' && input.automaticPlayers?.includes(command.playerId)) return reject('automatic_play');
  if (principal.kind === 'player' && (principal.playerId !== command.playerId || command.intent.type === 'expire')) return reject('unauthorized');
  if (!input.players.some(p => p.id === command.playerId) || !isUuid(command.requestId)) return reject('unauthorized');
  const i = command.identity;
  if (i.sessionId !== input.identity.sessionId || i.dealerGameId !== input.identity.dealerGameId || i.handNumber !== input.identity.handNumber) return reject('identity');
  const fingerprint = JSON.stringify([command.roundId, command.revision, command.intent.type, command.intent.type === 'place' ? command.intent.column : null]);
  const receiptKey = `${command.playerId}:${command.requestId}`;
  const receipt = input.receipts[receiptKey];
  if (receipt) return receipt.fingerprint === fingerprint ? {state: input, status: 'duplicate'} : reject('request_conflict');
  const current = input.rounds.at(-1);
  if (!current || current.id !== command.roundId) return reject('stale_round');
  if (command.intent.type !== 'acknowledge' && current.active_player_id !== command.playerId) return reject('not_your_turn');
  const original = current.boards[command.playerId];
  if (original.revision !== command.revision) return reject('stale_revision');
  if (!Number.isSafeInteger(at) || at < input.updatedAt) return reject('authority_clock');
  const type = command.intent.type;
  if (type === 'acknowledge') {
    if (!current.revealed || current.acknowledged.includes(command.playerId)) return reject('reveal_boundary');
  } else if (original.result || current.revealed) return reject('round_complete');
  else if (type === 'ready') {
    if (original.presented.length) return reject('already_ready');
  } else if (!original.presented.length) return reject('not_ready');
  const releaseAt = turnReleaseAt(original, input.config);
  if (type !== 'ready' && type !== 'acknowledge' && releaseAt !== null && at < releaseAt) return reject('round_intro');
  const expired = original.deadline !== null && at >= original.deadline && !original.result;
  if (!expired) {
    if (type === 'place' && !legalColumns(original, input.config).includes(command.intent.type === 'place' ? command.intent.column : -1)) return reject('column_locked');
    if (type === 'pass' && original.passesUsed >= input.config.passes) return reject('pass_used');
    if (type === 'collect' && !canFinish(original, input.config)) return reject('collect_unavailable');
    if (type === 'expire') return reject('before_deadline');
  }
  const match = structuredClone(input);
  const round = match.rounds.at(-1)!;
  const board = round.boards[command.playerId];
  if (type !== 'acknowledge' && type !== 'ready') board.revision++;
  if (expired) finish(match, round, board, 'timeout', board.deadline!, command.requestId, at);
  else if (type === 'acknowledge') {
    round.acknowledged.push(command.playerId);
    event(match, 'reveal_acknowledged', at, board.playerId, command.requestId);
  } else if (type === 'ready') {
    event(match, 'player_ready', at, board.playerId, command.requestId);
    startTurn(match, round, board, at, command.requestId);
  } else if (type === 'collect') finish(match, round, board, 'collect', at, command.requestId);
  else if (type === 'place' || type === 'pass') {
    const card = board.current!;
    if (command.intent.type === 'place') {
      if (board.startedAt === null) {
        board.startedAt = at;
        board.deadline = at + duration(match.config);
        if (board.firstPlacementDeadline !== undefined) board.firstPlacementDeadline = null;
      }
      board.columns[command.intent.column].push(card);
    }
    else board.passesUsed++;
    board.current = null;
    board.cardIndex++;
    if (command.intent.type === 'pass') event(match, 'pass_used', at, board.playerId, command.requestId, {});
    else if (command.intent.type === 'place') event(match, 'card_placed', at, board.playerId, command.requestId,
      {card, column: command.intent.column, speed: speedAt(board, match.config, at),
        totals: board.columns.map(c => total(c, match.config.target))});
    if (board.columns.some(c => total(c, match.config.target).bust)) finish(match, round, board, 'bust', at, command.requestId);
    else if (type === 'place' && isPerfectBoard(board, match.config)) finish(match, round, board, 'collect', at, command.requestId);
    else present(match, round, board, at, command.requestId);
  } else return reject('invalid_intent');
  // Timestamp on timeout is the exact deadline, while the commit clock remains monotonic.
  match.updatedAt = at;
  match.receipts[receiptKey] = {fingerprint, sequence: match.eventSequence!};
  return {state: match, status: 'accepted'};
}
export function settlementIntent(match: Match): SettlementIntent | null {
  if (!match.winnerId) return null;
  return {key: `run21:${match.identity.dealerGameId}:${match.identity.handNumber}`, winnerId: match.winnerId,
    loserId: match.players.find(p => p.id !== match.winnerId)!.id, amount: match.stake};
}
/** Service-only timeout transition. Money mode comes from persisted admission. */
export function expireFirstPlacement(input: Match, at: number, realMoney: boolean): Match {
  const round = input.rounds.at(-1), id = round?.active_player_id;
  const board = id ? round!.boards[id] : null;
  if (input.players.find(player => player.id === id)?.kind !== 'human') return input;
  if (!id || !board || board.result || board.startedAt !== null || board.firstPlacementDeadline == null ||
      at < board.firstPlacementDeadline || input.pausedAt != null || input.automaticPlayers?.includes(id)) return input;
  clock(input, at);
  const match = structuredClone(input);
  if (realMoney) {
    match.pausedAt = at;
    match.rounds.at(-1)!.boards[id].firstPlacementDeadline = at + match.config.firstPlacementSeconds! * 1000;
  } else {
    match.automaticPlayers = [...(match.automaticPlayers ?? []), id];
    match.rounds.at(-1)!.boards[id].firstPlacementDeadline = null;
  }
  event(match, 'first_placement_timeout', at, id, null, {realMoney});
  return match;
}
/** Records a receipt from the existing settlement infrastructure; never transfers money. */
export function recordSettlement(input: Match, receipt: SettlementReceipt): Match {
  const intent = settlementIntent(input);
  if (!intent || Object.keys(intent).some(k => receipt[k as keyof SettlementIntent] !== intent[k as keyof SettlementIntent]) ||
      !isUuid(receipt.resultId) || !isUuid(receipt.transferBatchId)) throw new Error('settlement_identity');
  if (input.settlement) {
    if (JSON.stringify(input.settlement) !== JSON.stringify(receipt)) throw new Error('settlement_conflict');
    return input;
  }
  clock(input, receipt.at);
  const match = structuredClone(input);
  match.settlement = structuredClone(receipt);
  event(match, 'settlement_recorded', receipt.at, null, null, {receipt});
  return match;
}
