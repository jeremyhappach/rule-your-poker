/**
 * Presentation-only ordering for active player hands.
 *
 * Authoritative hand arrays remain in their server/deal order. These helpers
 * are used by transport and render projections so a card arrives in the same
 * order the active hand will display it.
 */

export type ActiveHandDisplayGame = 'holm' | 'three-five-seven' | 'cribbage' | 'gin-rummy';

export type DisplayOrderCard = {
  rank: string | number;
  suit: string;
};

const RANK_ORDER: Record<string, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

const GIN_SUIT_ORDER: Record<string, number> = {
  '♠': 0,
  '♥': 1,
  '♣': 2,
  '♦': 3,
};

function rankValue(rank: string | number, game: ActiveHandDisplayGame): number {
  if (String(rank) === 'A' && (game === 'holm' || game === 'three-five-seven')) {
    return 14;
  }
  return RANK_ORDER[String(rank)] ?? Number.MAX_SAFE_INTEGER;
}

function wildRankFor357(roundNumber: number | null | undefined): string | null {
  if (roundNumber === 1) return '3';
  if (roundNumber === 2) return '5';
  if (roundNumber === 3) return '7';
  return null;
}

/**
 * Returns source indexes in their final active-hand display order.
 * Equal cards retain their authoritative order, making the result stable.
 */
export function getActiveHandDisplayOrder<T extends DisplayOrderCard>(
  cards: readonly T[],
  game: ActiveHandDisplayGame,
  options: { roundNumber?: number | null } = {},
): number[] {
  const wildRank = game === 'three-five-seven'
    ? wildRankFor357(options.roundNumber)
    : null;

  return cards
    .map((card, sourceIndex) => ({ card, sourceIndex }))
    .sort((a, b) => {
      if (wildRank) {
        const aWild = String(a.card.rank) === wildRank;
        const bWild = String(b.card.rank) === wildRank;
        if (aWild !== bWild) return aWild ? -1 : 1;
      }

      const rankDifference = rankValue(a.card.rank, game) - rankValue(b.card.rank, game);
      if (rankDifference !== 0) return rankDifference;

      if (game === 'gin-rummy') {
        const suitDifference = (GIN_SUIT_ORDER[a.card.suit] ?? Number.MAX_SAFE_INTEGER) -
          (GIN_SUIT_ORDER[b.card.suit] ?? Number.MAX_SAFE_INTEGER);
        if (suitDifference !== 0) return suitDifference;
      }

      return a.sourceIndex - b.sourceIndex;
    })
    .map(({ sourceIndex }) => sourceIndex);
}

export function orderActiveHandCards<T extends DisplayOrderCard>(
  cards: readonly T[],
  game: ActiveHandDisplayGame,
  options: { roundNumber?: number | null } = {},
): T[] {
  return getActiveHandDisplayOrder(cards, game, options).map((index) => cards[index]);
}
