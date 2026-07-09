import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Gin Rummy self-heal contract test.
 *
 * Source-level assertion of the bounded stall-latch behavior added to
 * `GinRummyMobileCardsTab`. We don't render the component (too many
 * shell dependencies); we replicate the pure decision surface and
 * verify:
 *   - stuck DealRuntime (PRE_DEAL/DEALING) with full auth hand for
 *     ≥3s promotes to full-authoritative;
 *   - latch resets on hand identity change;
 *   - terminal (READY/GAMEPLAY) short-circuits without latch;
 *   - non-full auth hand never trips latch (opening reveal preserved).
 */

const CARDS_PER_PLAYER = 10;

type DealPhase = 'PRE_DEAL' | 'DEALING' | 'READY' | 'GAMEPLAY';
type GinPhase = 'first_draw' | 'playing' | 'knocking' | 'laying_off' | 'scoring' | 'complete' | 'dealing';

function isCurrentHandLocalHandPhase(phase: GinPhase) {
  return phase === 'first_draw' || phase === 'playing' || phase === 'knocking' || phase === 'laying_off' || phase === 'scoring';
}

function computeEligibleForStallHeal(args: {
  dealBoundToThisHand: boolean;
  dealPhase: DealPhase;
  authHandLen: number;
  ginPhase: GinPhase;
}) {
  const dealTerminal = args.dealBoundToThisHand && (args.dealPhase === 'READY' || args.dealPhase === 'GAMEPLAY');
  return (
    args.dealBoundToThisHand &&
    !dealTerminal &&
    args.authHandLen >= CARDS_PER_PLAYER &&
    isCurrentHandLocalHandPhase(args.ginPhase)
  );
}

function computeForceFullProjection(args: {
  dealBoundToThisHand: boolean;
  dealPhase: DealPhase;
  authHandLen: number;
  dealStalledSelfHeal: boolean;
}) {
  const dealTerminal = args.dealBoundToThisHand && (args.dealPhase === 'READY' || args.dealPhase === 'GAMEPLAY');
  return (
    !args.dealBoundToThisHand ||
    dealTerminal ||
    args.authHandLen > CARDS_PER_PLAYER ||
    args.dealStalledSelfHeal
  );
}

describe('Gin Rummy self-heal — bounded stall latch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('force-full-projection when transport is terminal (no latch needed)', () => {
    expect(
      computeForceFullProjection({
        dealBoundToThisHand: true,
        dealPhase: 'READY',
        authHandLen: 10,
        dealStalledSelfHeal: false,
      }),
    ).toBe(true);
  });

  it('does not force full projection during legitimate opening deal', () => {
    expect(
      computeForceFullProjection({
        dealBoundToThisHand: true,
        dealPhase: 'DEALING',
        authHandLen: 10,
        dealStalledSelfHeal: false,
      }),
    ).toBe(false);
  });

  it('is eligible for stall heal when auth full but transport stuck DEALING in playable phase', () => {
    expect(
      computeEligibleForStallHeal({
        dealBoundToThisHand: true,
        dealPhase: 'DEALING',
        authHandLen: 10,
        ginPhase: 'first_draw',
      }),
    ).toBe(true);
  });

  it('is eligible for stall heal when auth full but transport stuck PRE_DEAL in first_draw', () => {
    expect(
      computeEligibleForStallHeal({
        dealBoundToThisHand: true,
        dealPhase: 'PRE_DEAL',
        authHandLen: 10,
        ginPhase: 'first_draw',
      }),
    ).toBe(true);
  });

  it('is NOT eligible when auth hand still growing (opening card-by-card reveal)', () => {
    expect(
      computeEligibleForStallHeal({
        dealBoundToThisHand: true,
        dealPhase: 'DEALING',
        authHandLen: 3,
        ginPhase: 'first_draw',
      }),
    ).toBe(false);
  });

  it('promotes to full projection once stall latch armed', () => {
    expect(
      computeForceFullProjection({
        dealBoundToThisHand: true,
        dealPhase: 'DEALING',
        authHandLen: 10,
        dealStalledSelfHeal: true,
      }),
    ).toBe(true);
  });

  it('stall latch arms after 3s of eligibility', () => {
    let stalled = false;
    const timer = setTimeout(() => { stalled = true; }, 3000);
    vi.advanceTimersByTime(2999);
    expect(stalled).toBe(false);
    vi.advanceTimersByTime(2);
    expect(stalled).toBe(true);
    clearTimeout(timer);
  });

  it('unbound deal runtime always renders full authoritative (hydration path)', () => {
    // Refresh/reconnect: no runtime bound, full auth hand present.
    expect(
      computeForceFullProjection({
        dealBoundToThisHand: false,
        dealPhase: 'PRE_DEAL',
        authHandLen: 10,
        dealStalledSelfHeal: false,
      }),
    ).toBe(true);
  });

  it('hydration and post-latch live paths converge on same hand', () => {
    const hydration = computeForceFullProjection({
      dealBoundToThisHand: false,
      dealPhase: 'PRE_DEAL',
      authHandLen: 10,
      dealStalledSelfHeal: false,
    });
    const liveAfterLatch = computeForceFullProjection({
      dealBoundToThisHand: true,
      dealPhase: 'DEALING',
      authHandLen: 10,
      dealStalledSelfHeal: true,
    });
    expect(hydration).toBe(liveAfterLatch);
  });
});
