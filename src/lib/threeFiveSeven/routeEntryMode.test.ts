import { describe, expect, it } from 'vitest';

import {
  classifyInitialThreeFiveSevenEntry,
  resolveThreeFiveSevenRouteEntryMode,
} from './routeEntryMode';

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

  it('keeps the first complete identity live when 3-5-7 starts on a persistent route', () => {
    const identity = {
      dealerGameId: 'dealer-2',
      roundId: 'round-1',
      handNumber: 1,
    };

    const first = resolveThreeFiveSevenRouteEntryMode(null, identity, 'live-transition');
    expect(first).toEqual({ baseline: identity, entryMode: 'live-transition' });

    expect(resolveThreeFiveSevenRouteEntryMode(
      first.baseline,
      identity,
      'live-transition',
    ).entryMode).toBe('live-transition');
  });

  it('distinguishes cold entry from every non-3-5-7 persistent-route transition', () => {
    expect(classifyInitialThreeFiveSevenEntry(null, '3-5-7')).toBe('historical-entry');
    for (const previous of ['holm-game', 'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee']) {
      expect(classifyInitialThreeFiveSevenEntry(previous, '3-5-7')).toBe('live-transition');
    }
  });
});
