import { describe, it, expect } from 'vitest';
import { routeChatBubbles } from './ChatBubbleOverlay';

const bubble = (id: string, user_id: string) => ({
  id,
  user_id,
  message: `m-${id}`,
  expiresAt: Date.now() + 10_000,
});

describe('ChatBubbleOverlay — routeChatBubbles', () => {
  const positions: Record<string, number> = {
    u1: 1,
    u2: 2,
    u4: 4,
    u5: 5,
    ghost: 9,
  };
  const getPositionForUserId = (uid: string) => positions[uid];

  it('groups bubbles by seat and pairs with resolved anchors (observer mode)', () => {
    const groups = routeChatBubbles({
      bubbles: [bubble('a', 'u1'), bubble('b', 'u1'), bubble('c', 'u5')],
      getPositionForUserId,
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    const byPos = Object.fromEntries(groups.map(g => [g.position, g]));
    expect(byPos[1].bubbles.map(b => b.id)).toEqual(['a', 'b']);
    expect(byPos[5].bubbles.map(b => b.id)).toEqual(['c']);
    // Observer mapping: pos 1 → slot 2, pos 5 → slot 5.
    expect(byPos[1].anchor.slot).toBe(2);
    expect(byPos[5].anchor.slot).toBe(5);
  });

  it('drops bubbles whose author maps to a seat not in the table', () => {
    const groups = routeChatBubbles({
      bubbles: [bubble('a', 'ghost'), bubble('b', 'u2')],
      getPositionForUserId,
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [{ position: 2, occupied: true }],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].position).toBe(2);
    expect(groups[0].bubbles.map(b => b.id)).toEqual(['b']);
  });

  it('drops bubbles whose author has no seat mapping', () => {
    const groups = routeChatBubbles({
      bubbles: [bubble('a', 'unknown'), bubble('b', 'u1')],
      getPositionForUserId,
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [{ position: 1, occupied: true }],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].bubbles.map(b => b.id)).toEqual(['b']);
  });

  it('uses ordinary clockwise projection for inherently-2P games (FACE_TO_FACE retired)', () => {
    const groups = routeChatBubbles({
      bubbles: [bubble('a', 'u5')],
      getPositionForUserId,
      projectionMode: 'active-canonical',
      viewerPosition: 1,
      gameType: 'cribbage',
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(groups).toHaveLength(1);
    // distance(1,5)=4 → slot 2 (top-left), same as multiplayer projection.
    expect(groups[0].anchor.slot).toBe(2);
  });

  it('uses ordinary projection for multiplayer-capable games', () => {
    const groups = routeChatBubbles({
      bubbles: [bubble('a', 'u5')],
      getPositionForUserId,
      projectionMode: 'active-canonical',
      viewerPosition: 1,
      gameType: 'horses',
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(groups[0].anchor.slot).toBe(2);
  });
});

