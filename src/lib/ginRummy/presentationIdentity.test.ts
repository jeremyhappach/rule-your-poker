import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceGinSelfDrawReleaseGate,
  canReleaseGinSelfDraw,
  ginPresentationActionKey,
  isGinMaskedCard,
  withholdGinDrawnCards,
} from './presentationIdentity';

const handContextId = 'dealer-game-1#rround-1#h1';

afterEach(() => {
  vi.useRealTimers();
});

describe('Gin presentation action identity', () => {
  it('dedupes optimistic and committed projections with different timestamps', () => {
    const optimistic = {
      actionCount: 7,
      lastAction: { type: 'draw_stock', playerId: 'player-1', timestamp: 'client-time' },
    };
    const committed = {
      actionCount: 7,
      lastAction: { type: 'draw_stock', playerId: 'player-1', timestamp: 'server-time' },
    };

    expect(ginPresentationActionKey(optimistic, handContextId)).toBe(
      ginPresentationActionKey(committed, handContextId),
    );
  });

  it('keeps consecutive actions and hand identities distinct', () => {
    const action = {
      actionCount: 7,
      lastAction: { type: 'discard', playerId: 'player-1', timestamp: 'same-time' },
    };
    expect(ginPresentationActionKey(action, handContextId)).not.toBe(
      ginPresentationActionKey({ ...action, actionCount: 8 }, handContextId),
    );
    expect(ginPresentationActionKey(action, handContextId)).not.toBe(
      ginPresentationActionKey(action, 'dealer-game-1#rround-2#h2'),
    );
  });

  it('refuses unbound or counterless presentation actions', () => {
    const action = {
      lastAction: { type: 'draw_stock', playerId: 'player-1', timestamp: 'client-time' },
    };
    expect(ginPresentationActionKey(action, handContextId)).toBeNull();
    expect(ginPresentationActionKey({ ...action, actionCount: 1 }, null)).toBeNull();
  });

  it('recognizes projected hidden-card placeholders', () => {
    expect(isGinMaskedCard({ rank: '?', suit: '?', masked: true })).toBe(true);
    expect(isGinMaskedCard({ rank: 'K', suit: '♠' })).toBe(false);
  });

  it('keeps a draw withheld when its 700ms animation beats the caller RPC', () => {
    vi.useFakeTimers();
    let gate = { animationSettled: false, authoritativeCardReady: false };
    setTimeout(() => {
      gate = advanceGinSelfDrawReleaseGate(gate, 'animation-settled');
    }, 700);

    vi.advanceTimersByTime(699);
    expect(canReleaseGinSelfDraw(gate)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gate).toEqual({ animationSettled: true, authoritativeCardReady: false });
    expect(canReleaseGinSelfDraw(gate)).toBe(false);

    gate = advanceGinSelfDrawReleaseGate(gate, 'authoritative-card-ready');
    expect(canReleaseGinSelfDraw(gate)).toBe(true);
  });

  it('keeps an authority-first draw withheld until its animation lands', () => {
    const pending = { animationSettled: false, authoritativeCardReady: false };
    const committed = advanceGinSelfDrawReleaseGate(pending, 'authoritative-card-ready');

    expect(committed).toEqual({ animationSettled: false, authoritativeCardReady: true });
    expect(canReleaseGinSelfDraw(committed)).toBe(false);

    const landed = advanceGinSelfDrawReleaseGate(committed, 'animation-settled');
    expect(canReleaseGinSelfDraw(landed)).toBe(true);
  });

  it('withholds a masked stock placeholder after the hand grows to eleven cards', () => {
    const openingHand = Array.from({ length: 10 }, (_, index) => ({
      rank: String(index + 1),
      suit: '♠',
    }));
    const optimisticHand = [...openingHand, { rank: '?', suit: '?' }];

    const projected = withholdGinDrawnCards(optimisticHand, [{ rank: '?', suit: '?' }]);

    expect(projected).toEqual(openingHand);
  });

  it('withholds a known discard draw until settlement and then admits it', () => {
    const openingHand = Array.from({ length: 10 }, (_, index) => ({
      rank: String(index + 1),
      suit: '♦',
    }));
    const discard = { rank: 'K', suit: '♥' };
    const authoritativeHand = [...openingHand, discard];

    expect(withholdGinDrawnCards(authoritativeHand, [discard])).toEqual(openingHand);
    expect(withholdGinDrawnCards(authoritativeHand, [])).toBe(authoritativeHand);
  });
});
