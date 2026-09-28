import { describe, expect, it } from 'vitest';
import {
  FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS,
  FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  sanitizeFarkleBlockingOverlayTiming,
} from './blockingOverlayTiming';

describe('Farkle blocking overlay Geometry Lab timing', () => {
  it('uses the 1900 ms Farkle-only default and safely bounds persisted drafts', () => {
    expect(FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS.displayLifetimeMs).toBe(1900);
    expect(sanitizeFarkleBlockingOverlayTiming({ displayLifetimeMs: 2474 })).toEqual({ displayLifetimeMs: 2450 });
    expect(sanitizeFarkleBlockingOverlayTiming({ displayLifetimeMs: -1 }).displayLifetimeMs)
      .toBe(FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS.displayLifetimeMs.min);
    expect(sanitizeFarkleBlockingOverlayTiming({ displayLifetimeMs: 'not-a-number' })).toEqual({ displayLifetimeMs: 1900 });
  });
});
