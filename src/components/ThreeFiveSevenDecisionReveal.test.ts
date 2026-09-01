import { describe, expect, it } from 'vitest';
import {
  revealDealerBubbleOrientation,
  revealStackDepthPx,
} from '@/lib/threeFiveSeven/decisionReveal';

describe('3-5-7 dedicated reveal-stack geometry', () => {
  it('keeps 3, 5, and 7 cards essentially one card-sized object', () => {
    expect(revealStackDepthPx(3)).toBe(2);
    expect(revealStackDepthPx(5)).toBe(4);
    expect(revealStackDepthPx(7)).toBe(6);
  });

  it('selects the canonical self endpoint only for a local dealer', () => {
    expect(revealDealerBubbleOrientation('user-1', 'user-1')).toBe('local');
    expect(revealDealerBubbleOrientation('user-2', 'user-1')).toBe('remote');
  });
});
