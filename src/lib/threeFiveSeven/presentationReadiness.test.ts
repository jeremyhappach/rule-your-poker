import { describe, expect, it } from 'vitest';
import {
  isThreeFiveSevenDealPresentationReady,
  resolveThreeFiveSevenStaticLegCount,
  type ThreeFiveSevenDealReadinessToken,
} from './presentationReadiness';

describe('3-5-7 deal presentation readiness', () => {
  const priorHandReady: ThreeFiveSevenDealReadinessToken = {
    handContextId: 'dealer-game-1#h1',
    allowed: true,
  };

  it('rejects a ready token inherited from the prior hand', () => {
    expect(isThreeFiveSevenDealPresentationReady('dealer-game-1#h2', priorHandReady)).toBe(false);
  });

  it('keeps the exact hand blocked until its runtime allows gameplay', () => {
    expect(isThreeFiveSevenDealPresentationReady('dealer-game-1#h2', {
      handContextId: 'dealer-game-1#h2',
      allowed: false,
    })).toBe(false);
  });

  it('admits controls and timer only for the exact ready hand', () => {
    expect(isThreeFiveSevenDealPresentationReady('dealer-game-1#h2', {
      handContextId: 'dealer-game-1#h2',
      allowed: true,
    })).toBe(true);
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
