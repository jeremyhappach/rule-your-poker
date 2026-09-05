import { describe, expect, it } from 'vitest';
import { reconcileHolmCommunityFaces } from './holmCommunityFaces';
import type { Card } from './cardUtils';

const opening = [{ rank: '9', suit: '♥' }, { rank: '5', suit: '♥' }, { rank: '?', suit: '?', masked: true }, { rank: '?', suit: '?', masked: true }] as unknown as Card[];
const revealed = [...opening.slice(0, 2), { rank: '5', suit: '♠' }, { rank: 'Q', suit: '♦' }] as Card[];

describe('Holm community continuity cache', () => {
  it('promotes resolved slots only for the exact presented hand', () => {
    expect(reconcileHolmCommunityFaces(opening, revealed, 'round:h1', 'round:h1')).toEqual(revealed);
    expect(reconcileHolmCommunityFaces(opening, revealed, 'round:h1', 'other:h1')).toBe(opening);
    expect(reconcileHolmCommunityFaces(opening, revealed, null, 'round:h1')).toBe(opening);
  });
  it('retains resolved faces on stale/empty delivery and avoids duplicate updates', () => {
    expect(reconcileHolmCommunityFaces(revealed, opening, 'round:h1', 'round:h1')).toBe(revealed);
    expect(reconcileHolmCommunityFaces(revealed, [], 'round:h1', 'round:h1')).toBe(revealed);
    expect(reconcileHolmCommunityFaces(revealed, [...revealed], 'round:h1', 'round:h1')).toBe(revealed);
  });
  it('rejects conflicting card identities instead of constructing a mixed deal', () => {
    const conflicting = [{ rank: 'A', suit: '♠' }, ...revealed.slice(1)] as Card[];
    expect(reconcileHolmCommunityFaces(opening, conflicting, 'round:h1', 'round:h1')).toBe(opening);
  });
});
