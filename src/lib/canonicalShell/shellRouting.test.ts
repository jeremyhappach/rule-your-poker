import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CANONICAL_SEAT_CONSUMERS,
  CANONICAL_SHELL_FAMILY,
  isCanonicalSeatConsumer,
  isCanonicalShellFamily,
  isPokerVariantFamily,
  resolveShellKind,
} from './shellRouting';

describe('isPokerVariantFamily', () => {
  it('returns true for poker-variant game types routed through MobileGameTable', () => {
    expect(isPokerVariantFamily('holm-game')).toBe(true);
    expect(isPokerVariantFamily('3-5-7')).toBe(true);
    expect(isPokerVariantFamily('3-5-7-game')).toBe(true);
    expect(isPokerVariantFamily('357')).toBe(true);
    expect(isPokerVariantFamily('horses')).toBe(true);
    expect(isPokerVariantFamily('ship-captain-crew')).toBe(true);
  });

  it('returns false for unified-table game types (cribbage / gin / yahtzee / trivia)', () => {
    expect(isPokerVariantFamily('cribbage')).toBe(false);
    expect(isPokerVariantFamily('gin-rummy')).toBe(false);
    expect(isPokerVariantFamily('yahtzee')).toBe(false);
    expect(isPokerVariantFamily('trivia')).toBe(false);
  });

  it('returns false for null / undefined / empty', () => {
    expect(isPokerVariantFamily(null)).toBe(false);
    expect(isPokerVariantFamily(undefined)).toBe(false);
    expect(isPokerVariantFamily('')).toBe(false);
  });
});

/**
 * Invariant: every registered canonical seat consumer MUST also be a
 * member of CANONICAL_SHELL_FAMILY. This is the bug class that wiped
 * chip stacks across both the Gin and Cribbage migrations — diverging
 * the two sets caused SeatAnchorLayer to never mount for the consumer,
 * yielding silent all-null slots downstream. Keep this test red until
 * the wiring matches.
 */
describe('canonical seat consumer registry invariant', () => {
  it('every CANONICAL_SEAT_CONSUMERS entry is also in CANONICAL_SHELL_FAMILY', () => {
    const missing = [...CANONICAL_SEAT_CONSUMERS].filter(
      gt => !CANONICAL_SHELL_FAMILY.has(gt),
    );
    expect(missing).toEqual([]);
  });

  it('isCanonicalSeatConsumer agrees with the registry', () => {
    expect(isCanonicalSeatConsumer('cribbage')).toBe(true);
    expect(isCanonicalSeatConsumer('gin-rummy')).toBe(true);
    // Not seat consumers (no per-seat anchor cluster ownership today):
    expect(isCanonicalSeatConsumer('yahtzee')).toBe(false);
    expect(isCanonicalSeatConsumer('trivia')).toBe(false);
    expect(isCanonicalSeatConsumer(null)).toBe(false);
    expect(isCanonicalSeatConsumer(undefined)).toBe(false);
  });

  it('every canonical seat consumer reports as canonical shell family', () => {
    for (const gt of CANONICAL_SEAT_CONSUMERS) {
      expect(isCanonicalShellFamily(gt)).toBe(true);
    }
  });
});
