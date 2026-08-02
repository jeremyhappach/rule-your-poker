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

  it('returns false for unified-table game types (cribbage / gin / yahtzee)', () => {
    expect(isPokerVariantFamily('cribbage')).toBe(false);
    expect(isPokerVariantFamily('gin-rummy')).toBe(false);
    expect(isPokerVariantFamily('yahtzee')).toBe(false);
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
    expect(isCanonicalSeatConsumer('yahtzee')).toBe(true);
    // PR-B: poker-variant family collapsed to canonical seat rendering.
    // MobileGameTable now reads every seat through useRequiredSeatAnchors
    // and renders through CanonicalSeatCluster — registered seat consumers.
    expect(isCanonicalSeatConsumer('holm-game')).toBe(true);
    expect(isCanonicalSeatConsumer('3-5-7')).toBe(true);
    expect(isCanonicalSeatConsumer('horses')).toBe(true);
    expect(isCanonicalSeatConsumer('ship-captain-crew')).toBe(true);
    // Not seat consumers:
    expect(isCanonicalSeatConsumer(null)).toBe(false);
    expect(isCanonicalSeatConsumer(undefined)).toBe(false);
  });

  it('every canonical seat consumer reports as canonical shell family', () => {
    for (const gt of CANONICAL_SEAT_CONSUMERS) {
      expect(isCanonicalShellFamily(gt)).toBe(true);
    }
  });
});

describe('resolveShellKind', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns canonical for null / undefined / empty (no committed family)', () => {
    expect(resolveShellKind(null)).toBe('canonical');
    expect(resolveShellKind(undefined)).toBe('canonical');
    expect(resolveShellKind('')).toBe('canonical');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns canonical for canonical-shell families', () => {
    expect(resolveShellKind('cribbage')).toBe('canonical');
    expect(resolveShellKind('gin-rummy')).toBe('canonical');
    expect(resolveShellKind('yahtzee')).toBe('canonical');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns poker-variant for poker-variant families', () => {
    expect(resolveShellKind('holm-game')).toBe('poker-variant');
    expect(resolveShellKind('3-5-7')).toBe('poker-variant');
    expect(resolveShellKind('horses')).toBe('poker-variant');
    expect(resolveShellKind('ship-captain-crew')).toBe('poker-variant');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once per unknown family in DEV and falls back to canonical', () => {
    // vitest runs with DEV=true by default
    expect(resolveShellKind('totally-made-up-game')).toBe('canonical');
    expect(resolveShellKind('totally-made-up-game')).toBe('canonical');
    expect(resolveShellKind('another-unknown')).toBe('canonical');
    // One warn per distinct unknown value, not per call
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('totally-made-up-game');
    expect(warnSpy.mock.calls[1][0]).toContain('another-unknown');
  });
});
