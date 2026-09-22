import { type Board, type Card, type Config, type Rank, type Suit } from './model.js';
export const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUITS: Suit[] = ['hearts','diamonds','clubs','spades'];
export const standardDeck = (): Card[] => SUITS.flatMap(suit => RANKS.map(rank => ({rank, suit})));
export const cardKey = (card: Card) => `${card.rank}:${card.suit}`;
export function total(cards: readonly Card[], target: number) {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    if (!RANKS.includes(card.rank) || !SUITS.includes(card.suit)) throw new Error('invalid_card');
    value += card.rank === 'A' ? 1 : ['J','Q','K'].includes(card.rank) ? 10 : Number(card.rank);
    if (card.rank === 'A') aces++;
  }
  const elevated = Math.max(0, Math.min(aces, Math.floor((target - value) / 10)));
  value += elevated * 10;
  return { value, elevated, bust: value > target, complete: value === target && elevated === 0 };
}
export const aggregate = (board: Board, config: Config) => board.columns.reduce((sum, cards) => sum + total(cards, config.target).value, 0);
export function speedAt(board: Board, config: Config, at: number): number {
  if (board.startedAt === null) return config.speed.start;
  return Math.max(0, config.speed.start - Math.floor(Math.max(0, at - board.startedAt) / config.speed.intervalMs) * config.speed.decrement);
}
export const duration = (config: Config) => Math.ceil(config.speed.start / config.speed.decrement) * config.speed.intervalMs;
export const multiplierAt = (value: number, config: Config) => config.multipliers[value] ?? 0;
export const canCollect = (board: Board, config: Config) => !board.result && board.startedAt !== null &&
  board.columns.every(c => !total(c, config.target).bust) && multiplierAt(aggregate(board, config), config) > 0;
export function legalColumns(board: Board, config: Config): number[] {
  if (board.result || !board.current) return [];
  // A busting placement is legal and ends the round; only completed columns are locked.
  return board.columns.flatMap((cards, i) => total(cards, config.target).complete ? [] : [i]);
}
