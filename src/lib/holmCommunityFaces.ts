import { useEffect, useMemo } from 'react';
import type { Card } from './cardUtils';
import { resolveCardFace } from './cardGames/resolvedCardFace';

export function reconcileHolmCommunityFaces(
  cached: Card[] | null,
  incoming: Card[] | undefined,
  cachedHand: string | null,
  presentedHand: string | null | undefined,
): Card[] | null {
  if (!cachedHand || cachedHand !== presentedHand || !cached || incoming?.length !== cached.length) return cached;
  // Resolved slots are immutable within the exact hand. Reject a conflicting
  // row rather than joining cards from different deals.
  if (cached.some((card, index) => {
    const previous = resolveCardFace(card);
    const next = resolveCardFace(incoming[index]);
    return previous && next && (previous.rank !== next.rank || previous.suit !== next.suit);
  })) return cached;
  let changed = false;
  const resolved = cached.map((card, index) => {
    if (!resolveCardFace(card) && resolveCardFace(incoming[index])) {
      changed = true;
      return incoming[index];
    }
    return card;
  });
  return changed ? resolved : cached;
}

/** Keep the continuity cache current without delaying the revealed render. */
export function useHolmCommunityFaces(
  cached: Card[] | null,
  incoming: Card[] | undefined,
  cachedHand: string | null,
  presentedHand: string | null | undefined,
  commit: (cards: Card[] | null) => void,
) {
  const cards = useMemo(
    () => reconcileHolmCommunityFaces(cached, incoming, cachedHand, presentedHand),
    [cached, incoming, cachedHand, presentedHand],
  );
  useEffect(() => {
    if (cards !== cached) commit(cards);
  }, [cards, cached, commit]);
  return cards;
}
