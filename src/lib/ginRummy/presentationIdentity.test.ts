import { describe, expect, it } from 'vitest';
import { ginPresentationActionKey, isGinMaskedCard } from './presentationIdentity';

const handContextId = 'dealer-game-1#rround-1#h1';

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
});
