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
    expect(observerSlotForPosition(4)).toBe(-1);
    expect(observerSlotForPosition(5)).toBe(5);
    expect(observerSlotForPosition(6)).toBe(4);
    expect(observerSlotForPosition(7)).toBe(3);
  });

  it('ignores 2P canonicalization for observers', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 1)?.slot).toBe(2);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
    expect(anchors.every(a => !a.canonicalized2p)).toBe(true);
  });
});

describe('seatAnchors — active-canonical', () => {
  it('places viewer at HOME and rotates others clockwise', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 4,
      seats: [
        { position: 4, occupied: true },
        { position: 5, occupied: true },
        { position: 6, occupied: true },
        { position: 3, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 4)?.slot).toBe(SLOT.HOME);
    // distance(4,5)=1 → slot 5 (bottom-right)
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
    // distance(4,6)=2 → slot 4
    expect(anchors.find(a => a.position === 6)?.slot).toBe(4);
    // distance(4,3)=6 → slot 0 (bottom-left)
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
});

describe('seatAnchors — 2-player face-to-face canonicalization', () => {
  it('forces opponent to FACE_TO_FACE when exactly two active seats and viewer is one of them', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 2,
      seats: [
        { position: 2, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.find(a => a.position === 2)?.slot).toBe(SLOT.HOME);
    const opp = anchors.find(a => a.position === 5);
    expect(opp?.slot).toBe(SLOT.FACE_TO_FACE);
    expect(opp?.canonicalized2p).toBe(true);
  });

  it('does NOT canonicalize when 3+ seats are occupied', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 1,
      seats: [
        { position: 1, occupied: true },
        { position: 3, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.every(a => !a.canonicalized2p)).toBe(true);
  });

  it('does NOT canonicalize in observer-absolute mode even with 2 seats', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.every(a => !a.canonicalized2p)).toBe(true);
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
    // Other anchors retain their absolute slot.
    expect(anchors.find(a => a.position === 1)?.slot).toBe(2);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
  });
});
