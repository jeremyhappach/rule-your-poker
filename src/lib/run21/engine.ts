import { assertConfig, isUuid, SCORE_PRESENTATION_MS, type Match, type Identity, type Config, type Player, type Round, type Board, type Command, type Principal, type DeckEvidence, type Frame, type Projection, type SettlementIntent, type SettlementReceipt } from './model.js';
import { aggregate, cardKey, duration, legalColumns, canCollect, speedAt, standardDeck, total, multiplierAt } from './rules.js';

function clock(match: Match, at: number) {
  if (!Number.isSafeInteger(at) || at < match.updatedAt) throw new Error('non_monotonic_authority_clock');
}
export function frameOf(match: Match): Frame {
  const round = match.rounds.at(-1);
  return structuredClone({ identity: match.identity, config: match.config, players: match.players, stake: match.stake,
    roundId: round?.id ?? null, roundNumber: round?.number ?? 0, commitment: round?.secret.commitment ?? null,
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
  match.events.push({ sequence: match.events.length + 1, type, at, roundId: match.rounds.at(-1)?.id ?? null,
    actorId, requestId, operands: structuredClone(operands), frame: frameOf(match) });
}
export function createMatch(identity: Identity, players: Player[], stake: number, config: Config, at: number): Match {
  assertConfig(config);
  if (!isUuid(identity.sessionId) || !isUuid(identity.dealerGameId) || !Number.isSafeInteger(identity.handNumber) || identity.handNumber < 1 ||
      players.length !== 2 || players.some(p => !isUuid(p.id) || !Number.isSafeInteger(p.seat) || p.seat < 0) ||
      new Set(players.map(p => p.id)).size !== 2 || new Set(players.map(p => p.seat)).size !== 2 ||
      !Number.isSafeInteger(stake) || stake < 0 || !Number.isSafeInteger(at) || at < 0) throw new Error('invalid_match');
  const match: Match = structuredClone({ identity, players, stake, config, rounds: [],
    cumulative: Object.fromEntries(players.map(p => [p.id, 0])), winnerId: null, settlement: null, receipts: {}, events: [], updatedAt: at });
  event(match, 'match_created', at);
  return match;
}
/** Trusted server entry point. The future persistence adapter locks match identity first. */
export function prepareRound(input: Match, id: string, predecessorId: string | null, deck: DeckEvidence, at: number): Match {
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
  const expected = new Set(standardDeck().map(cardKey));
  if (deck.cards.length !== expected.size || new Set(deck.cards.map(cardKey)).size !== expected.size ||
      deck.cards.some(c => !expected.has(cardKey(c))) || !/^[0-9a-f]{64}$/.test(deck.commitment) || !/^[0-9a-f]{64}$/.test(deck.salt)) throw new Error('invalid_deck_evidence');
  const match = structuredClone(input);
  // Persisted participant order is canonical seat order; alternate the starter by round.
  const starter = match.players[match.rounds.length % match.players.length].id;
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
  board.revision++;
  event(match, 'turn_started', at, null, requestId, {active_player_id: board.playerId});
  present(match, round, board, at, requestId);
}
function finish(match: Match, round: Round, board: Board, reason: NonNullable<Board['result']>['reason'], at: number, requestId: string, transferAt = at) {
  const totals = board.columns.map(c => total(c, match.config.target));
  const sum = aggregate(board, match.config);
  const speed = speedAt(board, match.config, at);
  const rule = reason === 'timeout' ? match.config.expiration : reason === 'bust' ? match.config.bust : reason === 'exhausted' ? match.config.exhausted : 'score';
  const multiplier = totals.some(t => t.bust) ? 0 : multiplierAt(sum, match.config);
  board.result = {reason, at, aggregate: sum, totals: totals.map(t => t.value), aceElevations: totals.map(t => t.elevated),
    multiplier, speed, score: rule === 'zero' ? 0 : multiplier * speed};
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
  board.current = round.secret.cards[board.cardIndex] ?? null;
  if (board.current) {
    board.presented.push(structuredClone(board.current));
    event(match, 'card_presented', at, board.playerId, requestId, {card: board.current, cardIndex: board.cardIndex});
  } else finish(match, round, board, 'exhausted', at, requestId);
}
export interface ActionResult { state: Match; status: 'accepted' | 'duplicate' | 'rejected'; reason?: string }
/** Pure transactional specification. Only an authenticated server supplies principal and at. */
export function applyCommand(input: Match, command: Command, principal: Principal, at: number): ActionResult {
  const reject = (reason: string): ActionResult => ({ state: input, status: 'rejected', reason });
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
  const expired = original.deadline !== null && at >= original.deadline && !original.result;
  if (!expired) {
    if (type === 'place' && !legalColumns(original, input.config).includes(command.intent.type === 'place' ? command.intent.column : -1)) return reject('column_locked');
    if (type === 'pass' && original.passesUsed >= input.config.passes) return reject('pass_used');
    if (type === 'collect' && !canCollect(original, input.config)) return reject('collect_unavailable');
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
    else present(match, round, board, at, command.requestId);
  } else return reject('invalid_intent');
  // Timestamp on timeout is the exact deadline, while the commit clock remains monotonic.
  match.updatedAt = at;
  match.receipts[receiptKey] = {fingerprint, sequence: match.events.length};
  return {state: match, status: 'accepted'};
}
export function settlementIntent(match: Match): SettlementIntent | null {
  if (!match.winnerId) return null;
  return {key: `run21:${match.identity.dealerGameId}:${match.identity.handNumber}`, winnerId: match.winnerId,
    loserId: match.players.find(p => p.id !== match.winnerId)!.id, amount: match.stake};
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
