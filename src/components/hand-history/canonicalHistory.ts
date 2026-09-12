export interface HistoryCard { rank: string; suit: string }
export interface HistoryParticipant { playerId: string; userId: string; name: string; position?: number }
export interface HistorySnapshot { stacks?: Record<string, number>; pot?: number; scores?: Record<string, number> }
export interface HistoryEvent {
  id: string;
  roundId: string | null;
  roundNumber: number | null;
  sequence: number;
  type: string;
  actorId: string | null;
  payload: Record<string, any>;
  occurredAt: string;
}
export interface HistoryHand {
  id: string;
  handNumber: number;
  participants: HistoryParticipant[];
  opening: HistorySnapshot;
  closing: HistorySnapshot | null;
  scoresAfter: Record<string, number> | null;
  terminal: boolean;
  provenance: 'captured' | 'legacy_partial';
  events: HistoryEvent[];
}
export interface HistoryGame { id: string; gameType: string; startedAt: string; config: Record<string, unknown>; hands: HistoryHand[] }
export interface HistoryResponse { version: 1; games: HistoryGame[] }

export function playerName(hand: HistoryHand, id: string | null, fallback = 'Player'): string {
  return hand.participants.find(p => p.playerId === id)?.name ?? fallback;
}

export function recordedChange(hand: HistoryHand, userId?: string): number | null {
  const ids = hand.participants.filter(p => p.userId === userId).map(p => p.playerId);
  if (!ids.length) return null;
  if (hand.events.some(e => e.type === 'result' && e.payload.financialRecorded === false)) return null;
  return hand.events.filter(e => e.type === 'result').reduce((total, e) =>
    total + ids.reduce((sum, id) => sum + (Number(e.payload.deltas?.[id]) || 0), 0), 0);
}

export function peggingTotals(events: HistoryEvent[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of events) {
    if (e.actorId && (e.type === 'pegging_award' || e.type === 'pegging_total')) {
      totals[e.actorId] = (totals[e.actorId] ?? 0) + Number(e.payload.points ?? 0);
    }
  }
  return totals;
}

export function resultText(event: HistoryEvent, hand: HistoryHand): string {
  const p = event.payload;
  const name = playerName(hand, event.actorId, p.name || 'Result');
  if (p.settlementKey === 'gin_rummy_hand_history') return p.description || 'Hand scored';
  if (p.name === 'Ante') return 'Antes collected';
  if (p.name === 'Pussy Tax') return p.description || 'Everyone folded';
  if (Number(p.amount) > 0 && (event.actorId || p.isChopped)) {
    const detail = p.description && !p.description.includes('wins') ? ` — ${p.description}` : '';
    return `${name} ${p.isChopped ? 'shared' : 'won'} $${Number(p.amount).toLocaleString()}${detail}`;
  }
  return p.description || `${name}: no payout`;
}

export const historyGameNames: Record<string, string> = {
  'holm-game': 'Holm', holm: 'Holm', '3-5-7': '3-5-7', '3-5-7-game': '3-5-7', '357': '3-5-7',
  'gin-rummy': 'Gin', cribbage: 'Cribbage', horses: 'Horses', 'ship-captain-crew': 'SCC', yahtzee: 'Yahtzee',
};

export const actionNames: Record<string, string> = {
  stay: 'stayed', fold: 'folded', draw_stock: 'drew from the stock', draw_discard: 'drew from the discard pile',
  discard: 'discarded', knock: 'knocked', gin: 'declared gin', lay_off: 'laid off a card',
  finish_layoff: 'finished laying off', pass: 'passed', pass_first_draw: 'passed the opening card',
  take_first_draw: 'took the opening card',
};
