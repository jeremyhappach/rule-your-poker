// @ts-nocheck
// Turn 1 Patch A — CribbageMobileCardsTab opening-deal clip contract.
//
// The DEALING branch of `clippedHand` must:
//   1. NOT short-circuit to [] when `activeHandBlocked` is true —
//      that flag reflects the parent's action-legality gate
//      (interactionsAllowed), which transiently drops to false during
//      opening-deal presentation lag and would otherwise mask each
//      settled card, producing the 0 → 4/5/6 batch-reveal defect.
//   2. Clip from `authoritativeHand` when present, falling back to
//      `sourceHand`. This is safe because DealRuntime is host-keyed by
//      handContextId (see DealRuntimeMaybe in CribbageMobileGameTable),
//      so `getSettledCountForPlayer` inherently counts current-hand
//      settles only. Using authoritativeHand also avoids ever showing
//      a stale prior-hand's cards during a hand boundary.
//   3. Continue to honor activeHandBlocked in READY/GAMEPLAY (post-deal
//      terminal states), preserving stale-hand safety after the deal
//      window ends.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(__dirname, 'CribbageMobileCardsTab.tsx'),
  'utf-8'
);

describe('CribbageMobileCardsTab — opening-deal clip contract', () => {
  it('DEALING branch does NOT short-circuit on activeHandBlocked', () => {
    // Fingerprint: the DEALING branch (after the PRE_DEAL check) must
    // compute `allowed` from getSettledCountForPlayer and slice
    // regardless of `activeHandBlocked`.
    const clipFn = src.match(
      /const clippedHand = \(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/
    );
    expect(clipFn, 'clippedHand IIFE not found').toBeTruthy();
    const body = clipFn![0];
    // The DEALING slice must appear.
    expect(body).toMatch(/getSettledCountForPlayer\(currentPlayerId\)/);
    expect(body).toMatch(/clipSource\.slice\(0,\s*allowed\)/);
    // And the DEALING branch's slice line must not itself be gated on
    // activeHandBlocked (we assert that the slice is unconditional
    // inside the DEALING tail).
    const dealingTail = body.split("deal.phase === 'PRE_DEAL'")[1] ?? '';
    expect(dealingTail).toMatch(/getSettledCountForPlayer/);
    expect(dealingTail).not.toMatch(/activeHandBlocked\s*\?\s*\[\s*\]/);
  });

  it('DEALING branch clips from authoritativeHand when available, else sourceHand', () => {
    const clipFn = src.match(
      /const clippedHand = \(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/
    )![0];
    expect(clipFn).toMatch(/authoritativeHand[\s\S]*?authoritativeHand\.length\s*>\s*0/);
    expect(clipFn).toMatch(/:\s*sourceHand/);
  });

  it('READY/GAMEPLAY still honor activeHandBlocked (post-deal stale-hand safety preserved)', () => {
    const clipFn = src.match(
      /const clippedHand = \(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/
    )![0];
    // Look for the READY/GAMEPLAY branch; it must ternary on activeHandBlocked.
    expect(clipFn).toMatch(
      /deal\.phase === 'GAMEPLAY' \|\| deal\.phase === 'READY'[\s\S]*?activeHandBlocked\s*\?\s*\(\[\s*\][\s\S]*?:\s*sourceHand/
    );
  });

  it('PRE_DEAL branch renders empty regardless of activeHandBlocked', () => {
    const clipFn = src.match(
      /const clippedHand = \(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/
    )![0];
    expect(clipFn).toMatch(/deal\.phase === 'PRE_DEAL'[\s\S]*?return\s*\[\s*\]/);
  });
});
