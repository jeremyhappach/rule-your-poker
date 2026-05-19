import { describe, it, expect } from 'vitest';
import {
  resolveSeatAnchors,
  observerSlotForPosition,
  clockwiseDistance,
  activeSlotForDistance,
  isInherentlyTwoPlayerGameType,
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

  it('canonicalizes inherently-2P observer view to HOME + upper-left for ergonomics', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      gameType: 'cribbage',
      seats: [
        { position: 1, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    // Lower position → HOME (bottom-center), higher → slot 2 (upper-left).
    expect(anchors.find(a => a.position === 1)?.slot).toBe(SLOT.HOME);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(2);
    expect(anchors.every(a => a.canonicalized2p)).toBe(true);
  });

  it('preserves literal absolute mapping for multiplayer-capable observer views', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'observer-absolute',
      viewerPosition: null,
      gameType: 'holm',
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
  it('places viewer at HOME and rotates others by established convention', () => {
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
    // distance(4,5)=1 → slot 0 (BL)
    expect(anchors.find(a => a.position === 5)?.slot).toBe(0);
    // distance(4,6)=2 → slot 1 (ML)
    expect(anchors.find(a => a.position === 6)?.slot).toBe(1);
    // distance(4,3)=6 → slot 5 (BR)
    expect(anchors.find(a => a.position === 3)?.slot).toBe(5);
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

describe('seatAnchors — game-type-driven 2P face-to-face', () => {
  it('classifies inherently-2P game types', () => {
    expect(isInherentlyTwoPlayerGameType('cribbage')).toBe(true);
    expect(isInherentlyTwoPlayerGameType('gin_rummy')).toBe(true);
    expect(isInherentlyTwoPlayerGameType('gin-rummy')).toBe(true);
    expect(isInherentlyTwoPlayerGameType('yahtzee')).toBe(true);
    expect(isInherentlyTwoPlayerGameType('CRIBBAGE')).toBe(true);
  });

  it('classifies multiplayer-capable game types as NOT inherently 2P', () => {
    expect(isInherentlyTwoPlayerGameType('holm')).toBe(false);
    expect(isInherentlyTwoPlayerGameType('three_five_seven')).toBe(false);
    expect(isInherentlyTwoPlayerGameType('horses')).toBe(false);
    expect(isInherentlyTwoPlayerGameType('scc')).toBe(false);
    expect(isInherentlyTwoPlayerGameType(undefined)).toBe(false);
  });

  it('canonicalizes opponent to FACE_TO_FACE for inherently-2P game types', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 2,
      gameType: 'cribbage',
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

  it('does NOT canonicalize multiplayer-capable games even with exactly 2 seated', () => {
    for (const gameType of ['holm', 'three_five_seven', 'horses', 'scc']) {
      const anchors = resolveSeatAnchors({
        projectionMode: 'active-canonical',
        viewerPosition: 2,
        gameType,
        seats: [
          { position: 2, occupied: true },
          { position: 5, occupied: true },
        ],
      });
      expect(anchors.every(a => !a.canonicalized2p), `gameType=${gameType}`).toBe(true);
      // Opponent should occupy a normal perimeter slot via clockwise distance.
      expect(anchors.find(a => a.position === 5)?.slot).not.toBe(SLOT.FACE_TO_FACE);
    }
  });

  it('does NOT canonicalize when gameType is missing', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 2,
      seats: [
        { position: 2, occupied: true },
        { position: 5, occupied: true },
      ],
    });
    expect(anchors.every(a => !a.canonicalized2p)).toBe(true);
  });

  it('does NOT canonicalize 2P game type when 3+ seats are occupied (defensive)', () => {
    const anchors = resolveSeatAnchors({
      projectionMode: 'active-canonical',
      viewerPosition: 1,
      gameType: 'cribbage',
      seats: [
        { position: 1, occupied: true },
        { position: 3, occupied: true },
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
    expect(anchors.find(a => a.position === 1)?.slot).toBe(2);
    expect(anchors.find(a => a.position === 5)?.slot).toBe(5);
  });
});
