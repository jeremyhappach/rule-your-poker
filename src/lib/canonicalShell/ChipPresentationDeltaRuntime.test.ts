// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { projectFeltFacingRimOrigin } from './ChipPresentationDeltaRuntime';

describe('projectFeltFacingRimOrigin', () => {
  it('places an opponent label on the chip rim facing the canonical felt', () => {
    const point = projectFeltFacingRimOrigin(
      { left: 120, top: 160, width: 40, height: 40 },
      { left: 100, top: 100, width: 200, height: 200 },
    );

    // The disc center is (140, 180); the felt center is (200, 200), so the
    // projected point is one 20px disc radius toward the felt.
    expect(point.left).toBeCloseTo(158.9737, 3);
    expect(point.top).toBeCloseTo(186.3246, 3);
  });
});
