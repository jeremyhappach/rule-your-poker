import { describe, expect, it } from 'vitest';
import {
  classifyInitialThreeFiveSevenEntry,
  resolveThreeFiveSevenRouteEntryMode,
  type ThreeFiveSevenRouteEntryIdentity,
} from './threeFiveSeven/routeEntryMode';

const GAME_TYPES = [
  'holm-game',
  '3-5-7',
  'cribbage',
  'gin-rummy',
  'horses',
  'ship-captain-crew',
  'yahtzee',
] as const;

describe('cross-country persistent-route gauntlet', () => {
  it('covers every previous-game to next-game pair', () => {
    const pairs = GAME_TYPES.flatMap((from) => GAME_TYPES.map((to) => `${from}->${to}`));
    expect(new Set(pairs).size).toBe(49);
  });

  it('keeps 3-5-7 live for both connected clients after every other game', () => {
    const identity: ThreeFiveSevenRouteEntryIdentity = {
      dealerGameId: 'dealer-live',
      roundId: 'round-live',
      handNumber: 1,
    };
    for (const previous of GAME_TYPES.filter((gameType) => gameType !== '3-5-7')) {
      for (const client of ['client-1', 'client-2']) {
        const initialMode = classifyInitialThreeFiveSevenEntry(previous, '3-5-7');
        const first = resolveThreeFiveSevenRouteEntryMode(null, identity, initialMode);
        const rerender = resolveThreeFiveSevenRouteEntryMode(first.baseline, identity, initialMode);
        expect(first.entryMode, `${client}:${previous}:first`).toBe('live-transition');
        expect(rerender.entryMode, `${client}:${previous}:rerender`).toBe('live-transition');
      }
    }
  });

  it('reconstructs a lagging client while the connected client remains live', () => {
    const identity = { dealerGameId: 'dealer-live', roundId: 'round-live', handNumber: 1 };
    const connected = resolveThreeFiveSevenRouteEntryMode(
      null,
      identity,
      classifyInitialThreeFiveSevenEntry('holm-game', '3-5-7'),
    );
    const lagging = resolveThreeFiveSevenRouteEntryMode(
      null,
      identity,
      classifyInitialThreeFiveSevenEntry(null, '3-5-7'),
    );

    expect(connected.entryMode).toBe('live-transition');
    expect(lagging.entryMode).toBe('historical-entry');
  });

  it('keeps both already-present clients live when 3-5-7 is the first dealer game', () => {
    const identity = { dealerGameId: 'dealer-dg1', roundId: 'round-dg1', handNumber: 1 };
    for (const client of ['client-1', 'client-2']) {
      const initialMode = classifyInitialThreeFiveSevenEntry(null, '3-5-7', true);
      const first = resolveThreeFiveSevenRouteEntryMode(null, identity, initialMode);
      expect(first.entryMode, client).toBe('live-transition');
    }
  });

  it('treats a later 3-5-7 dealer identity as live even after historical entry', () => {
    const baseline = { dealerGameId: 'dealer-1', roundId: 'round-1', handNumber: 1 };
    const next = { dealerGameId: 'dealer-2', roundId: 'round-2', handNumber: 1 };
    expect(resolveThreeFiveSevenRouteEntryMode(
      baseline,
      next,
      'historical-entry',
    ).entryMode).toBe('live-transition');
  });
});
