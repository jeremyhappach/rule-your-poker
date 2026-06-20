import { describe, it, expect } from 'vitest';
import {
  resolveSeatAnchors,
  observerSlotForPosition,
  clockwiseDistance,
  activeSlotForDistance,
  SLOT,
} from './seatAnchors';

describe('seatAnchors — observer-absolute', () => {
  it('maps each absolute position to its fixed perimeter slot', () => {
    expect(observerSlotForPosition(1)).toBe(2);
    expect(observerSlotForPosition(2)).toBe(1);
    expect(observerSlotForPosition(3)).toBe(0);
    expect(observerSlotForPosition(4)).toBe(-3);
    expect(observerSlotForPosition(5)).toBe(5);
    expect(observerSlotForPosition(6)).toBe(4);
    expect(observerSlotForPosition(7)).toBe(3);
  });

  it('preserves literal absolute mapping for ALL game types (FACE_TO_FACE retired)', () => {
    for (const gameType of ['cribbage', 'gin_rummy', 'yahtzee', 'holm']) {
      const anchors = resolveSeatAnchors({
        projectionMode: 'observer-absolute',
        viewerPosition: null,
        gameType,
        seats: [
          { position: 1, occupied: true },
          { position: 5, occupied: true },
        ],
      });
      expect(anchors.find(a => a.position === 1)?.slot, gameType).toBe(2);
      expect(anchors.find(a => a.position === 5)?.slot, gameType).toBe(5);
    }
  });
});

describe('seatAnchors — active-canonical', () => {
  it('places viewer at HOME and rotates others by clockwise distance', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 4,
      gameType: 'holm',
      seats: [
        { position: 4, occupied: true },
        { position: 5, occupied: true },
        { position: 6, occupied: true },
        { position: 3, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 4)?.slot).toBe(SLOT.HOME);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
    expect(anchors.find(a => a.position === 6)?.slot).toBe(4);
    expect(anchors.find(a => a.position === 3)?.slot).toBe(0);
  });

  it('clockwise distance wraps around the 7-seat ring', () => {
    expect(clockwiseDistance(7, 1)).toBe(1);
    expect(clockwiseDistance(1, 7)).toBe(6);
    expect(clockwiseDistance(3, 3)).toBe(0);
  });

  it('activeSlotForDistance covers all 0..6 inputs', () => {
    expect(activeSlotForDistance(0)).toBe(SLOT.HOME);
    [1, 2, 3, 4, 5, 6].forEach(d => {
      expect(activeSlotForDistance(d)).not.toBeNull();
    });
    expect(activeSlotForDistance(7)).toBeNull();
  });

  it('uses ordinary clockwise projection for inherently-2P games (FACE_TO_FACE retired)', () => {
    // Cribbage/Gin/Yahtzee no longer canonicalize the opponent — the DB
    // topology normalizer places the second human at the physically
    // opposite seat (distance 3 or 4 → slot 3 / slot 2), so ordinary
    // projection already produces the face-to-face geometry.
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 1,
      gameType: 'cribbage',
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 1)?.slot).toBe(SLOT.HOME);
    // distance(1,5)=4 → slot 2 (top-left), via plain projection.
    expect(anchors.find(a => a.position === 5)?.slot).toBe(2);
  });
});

describe('seatAnchors — hidden seats', () => {
  it('returns null slot for hidden seats without reflowing others', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [
        { position: 1, occupied: true },
        { position: 2, occupied: false, hidden: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 2)?.slot).toBeNull();
    expect(anchors.find(a => a.position === 1)?.slot).toBe(2);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
  });
});
