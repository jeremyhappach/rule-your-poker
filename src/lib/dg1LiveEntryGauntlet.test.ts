import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyHolmRouteEntryMode } from './holmPresentationBarrier';
import { ALL_REAL_MONEY_GAME_TYPES } from './realMoneyLivenessContract';
import { classifyInitialThreeFiveSevenEntry } from './threeFiveSeven/routeEntryMode';

const gameSource = readFileSync(join(__dirname, '../pages/Game.tsx'), 'utf8');
const ginDealSource = readFileSync(join(__dirname, '../components/GinRummyDealOrchestrator.tsx'), 'utf8');

describe('first dealer-game live-entry gauntlet', () => {
  it('covers every real-money game family exactly once', () => {
    expect([...ALL_REAL_MONEY_GAME_TYPES].sort()).toEqual([
      '3-5-7',
      'cribbage',
      'gin-rummy',
      'holm-game',
      'horses',
      'ship-captain-crew',
      'yahtzee',
    ]);
  });

  it('keeps DG1 live for card transports only when the connected route witnessed startup', () => {
    expect(classifyInitialThreeFiveSevenEntry(null, '3-5-7', true))
      .toBe('live-transition');
    expect(classifyInitialThreeFiveSevenEntry(null, '3-5-7', false))
      .toBe('historical-entry');

    const identity = { dealerGameId: 'dg-1', roundId: 'round-1', handNumber: 1 };
    expect(classifyHolmRouteEntryMode({
      baseline: identity,
      current: identity,
      roundStatus: 'active',
      observedPreHandLifecycle: true,
    })).toBe('live-transition');
    expect(classifyHolmRouteEntryMode({
      baseline: identity,
      current: identity,
      roundStatus: 'active',
      observedPreHandLifecycle: false,
    })).toBe('historical-entry');
  });

  it('preserves the established DG1 guards for cribbage, gin, and all dice games', () => {
    expect(gameSource).toContain('const cribbageEntryMode:');
    expect(gameSource).toMatch(/\? 'historical-entry'\s*: 'live-transition'/);
    expect(ginDealSource).toContain('dispatchedOpeningDealManifests.has(handContextId)');
    expect(ginDealSource).toContain("if (deal.phase !== 'PRE_DEAL')");

    for (const gameType of ['horses', 'ship-captain-crew', 'yahtzee']) {
      expect(gameSource).toContain(`game.game_type === '${gameType}'`);
    }
  });
});
