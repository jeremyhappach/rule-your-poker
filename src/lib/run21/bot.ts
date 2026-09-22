import { type Board, type Card, type Config, type Intent, type Projection } from './model';
import { aggregate, canCollect, cardKey, legalColumns, multiplierAt, speedAt, standardDeck, total } from './rules';

export interface BotPolicy { seed: number; minActionMs: number; maxActionMs: number }
export const DEFAULT_BOT_POLICY: BotPolicy = {seed: 21, minActionMs: 220, maxActionMs: 420};
export function seededRandom(seed: number): () => number {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function decisionSeed(view: Projection, board: Board, seed: number) {
  let hash = seed;
  for (const char of `${view.roundId}:${board.playerId}:${board.revision}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash;
}
function place(board: Board, card: Card, column: number): Board {
  return {...board, columns: board.columns.map((cards, i) => i === column ? [...cards, card] : cards)};
}
function potential(board: Board, config: Config): number {
  const totals = board.columns.map(c => total(c, config.target));
  if (totals.some(t => t.bust)) return -1e9;
  // Prefer useful headroom and flexible Aces while balancing five useful columns.
  return totals.reduce((sum, t) => sum + t.value * 4 + (t.complete ? 22 : t.elevated ? 14 : 0) -
    (t.value > 11 && t.value < config.target ? (config.target - t.value) * 0.45 : 0), 0);
}
function payoff(board: Board, config: Config, at: number): number {
  return board.columns.some(c => total(c, config.target).bust) ? 0 : multiplierAt(aggregate(board, config), config) * speedAt(board, config, at);
}
/** Only a legal projection is accepted: no secret deck, server Match, or opponent strategy input. */
export function chooseAction(view: Projection, at: number, policy: BotPolicy = DEFAULT_BOT_POLICY): {intent: Intent; delayMs: number} | null {
  if (!view.viewerId || !Number.isSafeInteger(policy.minActionMs) || policy.minActionMs <= 0 ||
      !Number.isSafeInteger(policy.maxActionMs) || policy.maxActionMs < policy.minActionMs) throw new Error('invalid_bot_policy');
  const board = view.boards[view.viewerId];
  if (!board || board.result || !board.current) return null;
  const random = seededRandom(decisionSeed(view, board, policy.seed));
  const delayMs = policy.minActionMs + Math.floor(random() * (policy.maxActionMs - policy.minActionMs + 1));
  const actionAt = at + delayMs;
  const seen = new Set(board.presented.map(cardKey));
  const unseen = standardDeck().filter(c => !seen.has(cardKey(c)));
  const candidates: {intent: Intent; board: Board; utility: number}[] = [];
  for (const column of legalColumns(board, view.config)) {
    const next = place(board, board.current, column);
    candidates.push({intent: {type: 'place', column}, board: next, utility: 0});
  }
  if (board.passesUsed < view.config.passes) {
    const next = structuredClone(board);
    next.passesUsed++;
    candidates.push({intent: {type: 'pass'}, board: next, utility: 0});
  }
  const scoring = canCollect(board, view.config);
  const meanDelay = (policy.minActionMs + policy.maxActionMs) / 2;
  for (const candidate of candidates) {
    const next = candidate.board;
    if (next.columns.some(c => total(c, view.config.target).bust)) {candidate.utility = -1e9; continue;}
    const bank = payoff(next, view.config, actionAt + meanDelay);
    // Expectation over the legally unknown multiset, never the actual shuffled suffix.
    const nearScoring = aggregate(next, view.config) >= Math.min(...Object.keys(view.config.multipliers).map(Number)) - 11;
    const expected = unseen.length && nearScoring ? unseen.reduce((sum, card) => {
      let best = bank;
      for (let col = 0; col < next.columns.length; col++) {
        if (total(next.columns[col], view.config.target).complete) continue;
        const future = place(next, card, col);
        best = Math.max(best, payoff(future, view.config, actionAt + meanDelay * 2));
      }
      return sum + best;
    }, 0) / unseen.length : bank;
    candidate.utility = scoring ? Math.max(bank, expected) : potential(next, view.config) + expected / view.config.speed.start;
    if (candidate.intent.type === 'pass') candidate.utility -= scoring ? 1 : 8;
    candidate.utility += random() * 0.001;
  }
  candidates.sort((a, b) => b.utility - a.utility);
  if (scoring && payoff(board, view.config, actionAt) >= (candidates[0]?.utility ?? -Infinity)) return {intent: {type: 'collect'}, delayMs};
  return {intent: candidates[0]?.intent ?? {type: 'collect'}, delayMs};
}
