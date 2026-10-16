import { type Board, type Card, type Config, type Rank, type Suit, type Result } from './model.js';
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
export const perfectAggregate = (config: Config) => config.columns * config.target;
export const isPerfectBoard = (board: Board, config: Config) =>
  aggregate(board, config) === perfectAggregate(config) && canCollect(board, config);
export function speedAt(board: Board, config: Config, at: number): number {
  if (board.startedAt === null) return config.speed.start;
  return clockAt(config,at-board.startedAt).speed;
}
/** Completed ticks only; the same frozen bands drive display, scoring and deadline. */
function clockAt(config:Config,elapsed:number) {
  let value=config.speed.start,remaining=Math.max(0,elapsed),duration=0,speed=config.speed.start,resolved=false;
  for(const band of config.speed.bands??[{until:0,intervalMs:config.speed.intervalMs}]){
    const ms=Math.ceil((value-band.until)/config.speed.decrement)*band.intervalMs;
    if(!resolved){
      speed=Math.max(band.until,value-Math.floor(Math.min(remaining,ms)/band.intervalMs)*config.speed.decrement);
      if(remaining<ms)resolved=true;
      else remaining-=ms;
    }
    duration+=ms;value=band.until;
  }
  return {speed,duration};
}
export const duration = (config: Config) => clockAt(config,0).duration;
export const multiplierAt = (value: number, config: Config) => config.multipliers[value] ?? 0;
export const canCollect = (board: Board, config: Config) => !board.result && board.startedAt !== null &&
  board.columns.every(c => !total(c, config.target).bust) && multiplierAt(aggregate(board, config), config) > 0;
/** Give Up uses the same board finish; only qualified Collect can award points. */
export const canFinish = (board: Board, config: Config) => canCollect(board, config) ||
  (!board.result && !!board.current && aggregate(board, config) < 97 && board.columns.every(c => !total(c, config.target).bust));
export function legalColumns(board: Board, config: Config): number[] {
  if (board.result || !board.current) return [];
  // A busting placement is legal and ends the round; only completed columns are locked.
  return board.columns.flatMap((cards, i) => total(cards, config.target).complete ? [] : [i]);
}
/** Shared authoritative round scoring, independent of any match or financial lifecycle. */
export function scoreBoard(board:Board,config:Config,reason:Result['reason'],at:number):Result {
  const totals=board.columns.map(c=>total(c,config.target)),sum=aggregate(board,config),speed=speedAt(board,config,at);
  const rule=reason==='timeout'?config.expiration:reason==='bust'?config.bust:reason==='exhausted'?config.exhausted:'score';
  const multiplier=totals.some(t=>t.bust)?0:multiplierAt(sum,config);
  return {reason,at,aggregate:sum,totals:totals.map(t=>t.value),aceElevations:totals.map(t=>t.elevated),multiplier,speed,score:rule==='zero'?0:multiplier*speed};
}
