import { describe, expect, it } from 'vitest';
import {
  deriveCribbageCutPresentation,
  deriveCribbageHistoricalCribHydrationSeed,
  resolveCribbageCutPresentationEntryMode,
} from './cribbageCutPresentation';

const liveCut = {
  entryMode: 'live-transition' as const,
  phase: 'pegging',
  hasCutCard: true,
  authoritativeCribCount: 4,
  locallySettledCribCount: 4,
  cutRevealCompletedHandKey: null,
  handKey: 'round-a:7',
};

describe('deriveCribbageCutPresentation', () => {
  it('holds a live cut until its local reveal completes', () => {
    expect(deriveCribbageCutPresentation(liveCut)).toMatchObject({
      isHistoricalExposedCut: false,
      settledCribCount: 4,
      cutRevealComplete: false,
      isPeggingPresentationBlocked: true,
    });
  });

  it('reconstructs both cut facts for a rejoin directly into pegging', () => {
    expect(deriveCribbageCutPresentation({
      ...liveCut,
      entryMode: 'historical-entry',
      locallySettledCribCount: 0,
    })).toMatchObject({
      isHistoricalExposedCut: true,
      settledCribCount: 4,
      cutRevealComplete: true,
      isPeggingPresentationBlocked: false,
    });
  });

  it('recovers when authoritative pegging state arrives after an empty bootstrap', () => {
    const bootstrap = deriveCribbageCutPresentation({
      ...liveCut,
      entryMode: 'historical-entry',
      hasCutCard: false,
      authoritativeCribCount: 0,
      locallySettledCribCount: 0,
    });
    const recovered = deriveCribbageCutPresentation({
      ...liveCut,
      entryMode: 'historical-entry',
      locallySettledCribCount: bootstrap.settledCribCount,
    });

    expect(recovered.isPeggingPresentationBlocked).toBe(false);
    expect(recovered.settledCribCount).toBe(4);
  });

  it('does not carry a reveal acknowledgement across hand identities', () => {
    expect(deriveCribbageCutPresentation({
      ...liveCut,
      cutRevealCompletedHandKey: 'round-a:7',
      handKey: 'round-b:8',
    }).isPeggingPresentationBlocked).toBe(true);
  });

  it('recovers a delayed live peer that first receives a later hand in pegging', () => {
    const entryMode = resolveCribbageCutPresentationEntryMode({
      entryMode: 'live-transition',
      handKey: 'round-b:8',
      phase: 'pegging',
      observedPrePeggingHandKey: 'round-a:7',
    });

    expect(entryMode).toBe('historical-entry');
    expect(deriveCribbageCutPresentation({
      ...liveCut,
      entryMode,
      handKey: 'round-b:8',
      locallySettledCribCount: 0,
    }).isPeggingPresentationBlocked).toBe(false);
  });

  it('keeps the normal cut reveal for a live peer that observed this hand pre-pegging', () => {
    expect(resolveCribbageCutPresentationEntryMode({
      entryMode: 'live-transition',
      handKey: 'round-b:8',
      phase: 'pegging',
      observedPrePeggingHandKey: 'round-b:8',
    })).toBe('live-transition');
  });
});

describe('deriveCribbageHistoricalCribHydrationSeed', () => {
  it('restores a persisted partial crib after an empty refresh bootstrap', () => {
    expect(deriveCribbageHistoricalCribHydrationSeed({
      entryMode: 'historical-entry',
      authoritativeCribCount: 2,
      locallySettledCribCount: 0,
      hasDiscardIntent: false,
    })).toBe(2);
  });

  it('leaves later opponent crib growth to the live transport owner', () => {
    expect(deriveCribbageHistoricalCribHydrationSeed({
      entryMode: 'historical-entry',
      authoritativeCribCount: 4,
      locallySettledCribCount: 2,
      hasDiscardIntent: false,
    })).toBeNull();
  });

  it('does not expose authoritative growth while a discard is in flight', () => {
    expect(deriveCribbageHistoricalCribHydrationSeed({
      entryMode: 'historical-entry',
      authoritativeCribCount: 2,
      locallySettledCribCount: 0,
      hasDiscardIntent: true,
    })).toBeNull();
  });
});
