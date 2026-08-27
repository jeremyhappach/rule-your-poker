import { describe, expect, it } from 'vitest';
import type { GinRummyState } from '@/lib/ginRummyTypes';
import { isGinOpponentRevealReady } from './revealReadiness';

function stateWithOpponentCard(card: Record<string, unknown>): GinRummyState {
  return {
    dealerPlayerId: 'dealer',
    nonDealerPlayerId: 'opponent',
    playerStates: {
      dealer: { hand: [], melds: [], deadwood: [], deadwoodValue: 0 },
      opponent: { hand: [card], melds: [], deadwood: [], deadwoodValue: 0 },
    },
  } as unknown as GinRummyState;
}

describe('Gin opponent reveal readiness', () => {
  it('rejects the caller projection while the opponent face is masked', () => {
    expect(isGinOpponentRevealReady(stateWithOpponentCard({
      rank: '?', suit: '?', value: 0, masked: true,
    }), 'dealer')).toBe(false);
  });

  it('admits the authoritative post-knock reveal', () => {
    expect(isGinOpponentRevealReady(stateWithOpponentCard({
      rank: 'K', suit: '♠', value: 10,
    }), 'dealer')).toBe(true);
  });
});
