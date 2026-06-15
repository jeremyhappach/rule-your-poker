import { describe, expect, it } from 'vitest';
import {
  getBuckStartPosition,
  getFirstActorAfterDealer,
  getOccupiedSeatRing,
  nextClockwise,
  positionToRelativeSlot,
  previousClockwise,
  relativeSlotToPosition,
} from './seatRing';
import { SLOT } from './seatAnchors';

describe('seatRing', () => {
  const sevenHanded = [1, 2, 3, 4, 5, 6, 7];

  it('getOccupiedSeatRing returns ascending', () => {
    expect(getOccupiedSeatRing([5, 1, 7, 3])).toEqual([1, 3, 5, 7]);
  });

  it('nextClockwise = nearest LOWER occupied (wrap high)', () => {
    // dealer=4 → buck=3 (left of dealer = bottom-left slot for HOME viewer)
    expect(nextClockwise(4, sevenHanded)).toBe(3);
    // wrap: dealer=1 → buck=7
    expect(nextClockwise(1, sevenHanded)).toBe(7);
    // sparse ring: occupied={2,3,5,6}, dealer=5 → next=3
    expect(nextClockwise(5, [2, 3, 5, 6])).toBe(3);
    expect(nextClockwise(2, [2, 3, 5, 6])).toBe(6);
  });

  it('previousClockwise is inverse', () => {
    expect(previousClockwise(3, sevenHanded)).toBe(4);
    expect(previousClockwise(7, sevenHanded)).toBe(1);
    for (const p of sevenHanded) {
      expect(previousClockwise(nextClockwise(p, sevenHanded), sevenHanded)).toBe(p);
    }
  });

  it('buck lands at bottom-LEFT slot for a HOME dealer (7-handed)', () => {
    const dealer = 4;
    const buck = getBuckStartPosition(dealer, sevenHanded);
    expect(buck).toBe(3);
    expect(positionToRelativeSlot(buck, dealer, sevenHanded)).toBe(SLOT.BOTTOM_LEFT);
  });

  it('full clockwise iteration from buck back to dealer visits BL,ML,TL,TR,MR,BR,HOME', () => {
    const dealer = 4;
    const expected = [
      SLOT.BOTTOM_LEFT,
      SLOT.MIDDLE_LEFT,
      SLOT.TOP_LEFT,
      SLOT.TOP_RIGHT,
      SLOT.MIDDLE_RIGHT,
      SLOT.BOTTOM_RIGHT,
      SLOT.HOME,
    ];
    let cur = getBuckStartPosition(dealer, sevenHanded);
    const slots = [positionToRelativeSlot(cur, dealer, sevenHanded)];
    for (let i = 0; i < 5; i++) {
      cur = nextClockwise(cur, sevenHanded);
      slots.push(positionToRelativeSlot(cur, dealer, sevenHanded));
    }
    // dealer acts last
    cur = nextClockwise(cur, sevenHanded);
    expect(cur).toBe(dealer);
    slots.push(positionToRelativeSlot(cur, dealer, sevenHanded));
    expect(slots).toEqual(expected);
  });

  it('relativeSlotToPosition inverts positionToRelativeSlot', () => {
    for (const p of sevenHanded) {
      const slot = positionToRelativeSlot(p, 4, sevenHanded);
      if (slot === null) continue;
      expect(relativeSlotToPosition(slot, 4, sevenHanded)).toBe(p);
    }
  });

  it('getFirstActorAfterDealer respects direction', () => {
    expect(getFirstActorAfterDealer(4, sevenHanded)).toBe(3);
    expect(getFirstActorAfterDealer(4, sevenHanded, 'counter-clockwise')).toBe(5);
  });

  it('throws if position not in ring', () => {
    expect(() => nextClockwise(9, sevenHanded)).toThrow(/not present/);
  });
});
