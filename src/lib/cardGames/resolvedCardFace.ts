import type { Rank, Suit } from '@/lib/cardUtils';

const RANKS = new Set<string>(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
const SUITS: Record<string, Suit> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠',
};
const WORD_SUITS = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' } as const;

/** A masked, missing or malformed value is never a playable card face. */
export function resolveCardFace(card: unknown): { rank: Rank; suit: Suit } | null {
  if (!card || typeof card !== 'object') return null;
  const value = card as { rank?: unknown; suit?: unknown; masked?: unknown };
  if (value.masked !== undefined && value.masked !== false) return null;
  if (typeof value.rank !== 'string' || !RANKS.has(value.rank)) return null;
  if (typeof value.suit !== 'string') return null;
  const suit = Object.prototype.hasOwnProperty.call(SUITS, value.suit.toLowerCase()) ? SUITS[value.suit.toLowerCase()] : null;
  return suit ? { rank: value.rank as Rank, suit } : null;
}

export function isCardFaceResolved(card: unknown): boolean {
  return resolveCardFace(card) !== null;
}

/** Transport must not manufacture a suit when a private face is unavailable. */
export function resolveTransportCardFace(card: unknown) {
  const face = resolveCardFace(card);
  return face ? { rank: face.rank, suit: WORD_SUITS[face.suit] } : null;
}
