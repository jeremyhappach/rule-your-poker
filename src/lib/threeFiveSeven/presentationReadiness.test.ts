import { describe, expect, it } from 'vitest';
import {
  isThreeFiveSevenDealPresentationReady,
  isThreeFiveSevenRuntimeWaveReady,
  isThreeFiveSevenLegStackRetired,
  resolveThreeFiveSevenDealerGameScope,
  resolveThreeFiveSevenStaticLegCount,
  type ThreeFiveSevenDealReadinessToken,
} from './presentationReadiness';

describe('3-5-7 deal presentation readiness', () => {
  const priorHandReady: ThreeFiveSevenDealReadinessToken = {
    handContextId: 'dealer-game-1#h1',
    waveContextId: 'dealer-game-1#h1#r1',
    roundId: 'round-1',
    roundNumber: 1,
    allowed: true,
  };

  const expectedR2 = {
    handContextId: 'dealer-game-1#h2',
    waveContextId: 'dealer-game-1#h2#r2',
    roundId: 'round-2',
    roundNumber: 2,
  };

  it('rejects a ready token inherited from the prior hand', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, priorHandReady)).toBe(false);
  });

  it('rejects an R1 token when R2 publishes within the same hand', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, {
      handContextId: 'dealer-game-1#h2',
      waveContextId: 'dealer-game-1#h2#r1',
      roundId: 'round-1',
      roundNumber: 1,
      allowed: true,
    })).toBe(false);
  });

  it('keeps a live R2 blocked until all ten two-player card intents settle', () => {
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 6,
      expectedCumulativeCount: 10,
      historicalEntry: false,
    })).toBe(false);
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 10,
      expectedCumulativeCount: 10,
      historicalEntry: false,
    })).toBe(true);
  });

  it('admits controls and timer only for the exact settled wave', () => {
    expect(isThreeFiveSevenDealPresentationReady(expectedR2, {
      ...expectedR2,
      handContextId: expectedR2.handContextId!,
      waveContextId: expectedR2.waveContextId!,
      roundId: expectedR2.roundId!,
      roundNumber: expectedR2.roundNumber!,
      allowed: true,
    })).toBe(true);
  });

  it('preserves historical-entry reconstruction with no replayed intents', () => {
    expect(isThreeFiveSevenRuntimeWaveReady({
      runtimeAllowed: true,
      runtimeExpectedCount: 0,
      expectedCumulativeCount: 10,
      historicalEntry: true,
    })).toBe(true);
  });
});

describe('3-5-7 dealer-game presentation boundary', () => {
  it('uses the concrete authoritative dealer-game identity', () => {
    expect(resolveThreeFiveSevenDealerGameScope('dealer-game-2', null)).toBe('dealer-game-2');
  });

  it('preserves a null scope during the postgame handoff', () => {
    expect(resolveThreeFiveSevenDealerGameScope(null, undefined)).toBeNull();
  });

  it('keeps swept legs retired for the outgoing dealer game', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: 'dealer-game-1',
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(true);
  });

  it('keeps swept legs retired through the null handoff gap', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: null,
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(true);
  });

  it('releases the retired stack only for a different concrete dealer game', () => {
    expect(isThreeFiveSevenLegStackRetired({
      activeDealerGameId: 'dealer-game-2',
      retiredDealerGameId: 'dealer-game-1',
    })).toBe(false);
  });
});

describe('3-5-7 static leg presentation', () => {
  it('holds two earned legs while the terminal third leg is in flight', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 2,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: true,
      legsToWin: 3,
    })).toBe(2);
  });

  it('continues withholding one incoming leg for ordinary leg awards', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 2,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: false,
      legsToWin: 3,
    })).toBe(1);
  });

  it('clamps the terminal baseline to a configurable target', () => {
    expect(resolveThreeFiveSevenStaticLegCount({
      effectiveLegs: 4,
      isIncomingLegAnimating: true,
      isNormalTerminalFinalLegAward: true,
      legsToWin: 5,
    })).toBe(4);
  });
});
