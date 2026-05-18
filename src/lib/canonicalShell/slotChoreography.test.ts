import { describe, expect, it } from 'vitest';
import { SLOT_CHOREOGRAPHY } from './slotChoreography';

describe('SLOT_CHOREOGRAPHY', () => {
  it('exports sane timing constants', () => {
    expect(SLOT_CHOREOGRAPHY.interstitialDwellMs).toBeGreaterThan(0);
    expect(SLOT_CHOREOGRAPHY.interstitialDwellMs).toBeLessThan(2000);
    expect(SLOT_CHOREOGRAPHY.teardownGraceMs).toBe(0);
    expect(SLOT_CHOREOGRAPHY.mountStaggerMs).toBe(0);
  });
});
