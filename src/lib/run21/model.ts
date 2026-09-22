export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export interface Card { rank: Rank; suit: Suit }
export interface Config {
  preset: string;
  rounds: number;
  columns: number;
  target: number;
  passes: number;
  multipliers: Record<number, number>;
  speed: { start: number; decrement: number; intervalMs: number };
  expiration: 'zero' | 'score';
  bust: 'zero' | 'score';
  exhausted: 'zero' | 'score';
}
export const DEFAULT_CONFIG: Config = {
  preset: 'run21/1', rounds: 3, columns: 5, target: 21, passes: 1,
  multipliers: {97: 50, 98: 100, 99: 150, 100: 200, 101: 250, 102: 300, 103: 400, 104: 500, 105: 1000},
  speed: { start: 250, decrement: 1, intervalMs: 1000 },
  expiration: 'zero', bust: 'zero', exhausted: 'score',
};
export interface Identity { sessionId: string; dealerGameId: string; handNumber: number }
export interface Player { id: string; seat: number; name: string; kind: 'human' | 'bot' }
export interface Board {
  playerId: string;
  columns: Card[][];
  passesUsed: number;
  presented: Card[];
  current: Card | null;
  cardIndex: number;
  revision: number;
  /** First accepted placement time; admission and Pass leave both fields null. */
  startedAt: number | null;
  deadline: number | null;
  result: Result | null;
}
export interface Result {
  reason: 'collect' | 'bust' | 'timeout' | 'exhausted';
  at: number;
  aggregate: number;
  totals: number[];
  aceElevations: number[];
  multiplier: number;
  speed: number;
  score: number;
}
/** Private server-only input; never serialize this type to a client. */
export interface DeckEvidence { cards: Card[]; salt: string; commitment: string }
export interface Round {
  id: string; number: number; secret: DeckEvidence;
  starting_player_id: string; active_player_id: string | null;
  liveBoards?: boolean;
  scorePresentation?: ScorePresentation | null;
  boards: Record<string, Board>; revealed: boolean; acknowledged: string[];
}
export const SCORE_PRESENTATION_MS = 5000;
export interface ScorePresentation {
  playerId: string; startedAt: number; endsAt: number; from: number; to: number;
}
export type Intent = { type: 'ready' | 'pass' | 'collect' | 'expire' | 'acknowledge' } | { type: 'place'; column: number };
export interface Command {
  identity: Identity; roundId: string; playerId: string; requestId: string;
  revision: number; intent: Intent;
}
export type Principal = { kind: 'player'; playerId: string } | { kind: 'service' };
export interface SettlementIntent {
  key: string; winnerId: string; loserId: string; amount: number;
}
export interface SettlementReceipt extends SettlementIntent {
  resultId: string; transferBatchId: string; at: number;
}
export interface Frame {
  identity: Identity; config: Config; players: Player[]; stake: number;
  roundId: string | null; roundNumber: number; commitment: string | null;
  active_player_id: string | null;
  liveBoards?: boolean;
  scorePresentation?: ScorePresentation | null;
  boards: Record<string, Board>; revealed: boolean; acknowledged: string[];
  cumulative: Record<string, number>; winnerId: string | null;
  settlement: SettlementReceipt | null;
}
export interface Event {
  sequence: number; type: string; at: number; roundId: string | null;
  actorId: string | null; requestId: string | null;
  operands: Record<string, unknown>; frame: Frame;
}
export interface Match {
  identity: Identity; config: Config; players: Player[]; stake: number;
  rounds: Round[]; cumulative: Record<string, number>; winnerId: string | null;
  settlement: SettlementReceipt | null;
  receipts: Record<string, { fingerprint: string; sequence: number }>;
  events: Event[]; updatedAt: number;
}
export interface Projection extends Omit<Frame, 'boards'> {
  viewerId: string | null;
  boards: Record<string, Board | null>;
  /** Public one-use status only; never includes the passed card or private board. */
  passUsed: Record<string, boolean>;
  /** Public phase only; excludes cards, results, timestamps and score details. */
  playStatus: Record<string, 'waiting' | 'playing' | 'finished'>;
}
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function assertConfig(config: Config): void {
  for (const n of [config.rounds, config.columns, config.target, config.speed.start, config.speed.decrement, config.speed.intervalMs]) {
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error('invalid_config');
  }
  if (!Number.isSafeInteger(config.passes) || config.passes < 0 || config.columns > 52 || config.target > 52 * 11 ||
      !Object.keys(config.multipliers).length || !config.preset ||
      [config.expiration, config.bust, config.exhausted].some(v => !['zero', 'score'].includes(v))) throw new Error('invalid_config');
  for (const [aggregate, multiplier] of Object.entries(config.multipliers)) {
    if (!Number.isSafeInteger(+aggregate) || +aggregate < 0 || +aggregate > config.columns * config.target ||
        !Number.isSafeInteger(multiplier) || multiplier <= 0 ||
        !Number.isSafeInteger(multiplier * config.speed.start * config.rounds)) throw new Error('invalid_scoring');
  }
}
