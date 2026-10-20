import { resolveCardFace } from './resolvedCardFace';
import type { Card } from '../cardUtils';

/** Presentation extension only. Poker's Card/Rank/Suit universe stays unchanged. */
export type JokerFace = { kind: 'joker'; masked?: false };
export type PhysicalCard = { id: string; face: Card | JokerFace };
export function isResolvedJoker(value: unknown): value is JokerFace {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.kind === 'joker' && (c.masked === undefined || c.masked === false)
    && c.rank === undefined && c.suit === undefined;
}
export function physicalCardLabel(card: PhysicalCard): string {
  if (isResolvedJoker(card.face)) return 'Joker';
  const face = resolveCardFace(card.face);
  return face ? `${face.rank}${face.suit}` : 'Hidden card';
}
