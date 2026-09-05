import { describe, expect, it } from 'vitest';
import type { GinRummyCard, GinRummyState } from '@/lib/ginRummyTypes';
import { getGinForbiddenRediscardCard, isGinForbiddenRediscard } from './discardSelectionPolicy';

const playerId = 'player-1';
const drawnCard: GinRummyCard = { rank: '7', suit: '♥', value: 7 };

const makeState = (
  overrides: Partial<Pick<
    GinRummyState,
    'phase' | 'turnPhase' | 'currentTurnPlayerId' | 'drawSource' | 'lastAction'
  >> = {},
) => ({
  phase: 'playing' as const,
  turnPhase: 'discard' as const,
  currentTurnPlayerId: playerId,
  drawSource: 'discard' as const,
  lastAction: {
    type: 'draw_discard' as const,
    playerId,
    card: drawnCard,
    timestamp: '2026-08-30T12:00:00.000Z',
  },
  ...overrides,
});

describe('Gin discard selection policy', () => {
  it('locks the authoritative discard-pile draw after reload or rejoin', () => {
    const state = makeState();

    expect(getGinForbiddenRediscardCard(state, playerId)).toEqual(drawnCard);
    expect(isGinForbiddenRediscard(state, playerId, drawnCard)).toBe(true);
    expect(isGinForbiddenRediscard(state, playerId, { rank: '8', suit: '♥' })).toBe(false);
  });

  it('does not lock a stock draw', () => {
    const state = makeState({
      drawSource: 'stock',
      lastAction: { ...makeState().lastAction, type: 'draw_stock' },
    });

    expect(getGinForbiddenRediscardCard(state, playerId)).toBeNull();
  });

  it('does not inherit another player action', () => {
    const state = makeState({
      lastAction: { ...makeState().lastAction, playerId: 'player-2' },
    });

    expect(getGinForbiddenRediscardCard(state, playerId)).toBeNull();
  });

  it.each([
    ['draw phase', { turnPhase: 'draw' as const }],
    ['post-knock phase', { phase: 'laying_off' as const }],
    ['different active player', { currentTurnPlayerId: 'player-2' }],
  ])('does not lock during %s', (_label, overrides) => {
    expect(getGinForbiddenRediscardCard(makeState(overrides), playerId)).toBeNull();
  });

  it('does not derive a lock from a masked card', () => {
    const state = makeState({
      lastAction: {
        ...makeState().lastAction,
        card: { rank: '?', suit: '?', value: 0 } as unknown as GinRummyCard,
      },
    });

    expect(getGinForbiddenRediscardCard(state, playerId)).toBeNull();
  });
});
