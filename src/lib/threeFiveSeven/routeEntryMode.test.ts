import { describe, expect, it } from 'vitest';

import { resolveThreeFiveSevenRouteEntryMode } from './routeEntryMode';

describe('3-5-7 route entry provenance', () => {
  it('waits for the exact round identity before classifying a refresh', () => {
    const partial = resolveThreeFiveSevenRouteEntryMode(null, {
      dealerGameId: 'dealer-1',
      roundId: null,
      handNumber: null,
    });

    expect(partial).toEqual({ baseline: null, entryMode: undefined });

    const hydrated = resolveThreeFiveSevenRouteEntryMode(partial.baseline, {
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
      handNumber: 4,
    });

    expect(hydrated).toEqual({
      baseline: { dealerGameId: 'dealer-1', roundId: 'round-1', handNumber: 4 },
      entryMode: 'historical-entry',
    });
  });

  it('classifies only later exact wave identities as live transitions', () => {
    const baseline = {
      dealerGameId: 'dealer-1',
      roundId: 'round-1',
      handNumber: 4,
    };

    expect(resolveThreeFiveSevenRouteEntryMode(baseline, baseline).entryMode)
      .toBe('historical-entry');
    expect(resolveThreeFiveSevenRouteEntryMode(baseline, {
      ...baseline,
      roundId: 'round-2',
    }).entryMode).toBe('live-transition');
    expect(resolveThreeFiveSevenRouteEntryMode(baseline, {
      dealerGameId: 'dealer-2',
      roundId: 'round-3',
      handNumber: 1,
    }).entryMode).toBe('live-transition');
  });
});
