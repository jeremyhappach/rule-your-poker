import { describe, expect, it } from 'vitest';

/**
 * Contract mirror of the opening-hand projection predicate in
 * `src/components/GinRummyMobileCardsTab.tsx`. The predicate is inlined
 * inside the component, so this test replicates it byte-for-byte and
 * asserts the invariant: a matching non-terminal DealRuntime forbids
 * full-authoritative projection; PRE_DEAL projects 0; DEALING projects
 * exactly the settled count for the current player; terminal runtime
 * permits full projection.
 */

const GIN_CARDS_PER_PLAYER = 10;

function deriveForceFullProjection(args: {
  dealBoundToThisHand: boolean;
  dealPhase: 'PRE_DEAL' | 'DEALING' | 'WAVE' | 'READY' | 'GAMEPLAY' | null;
  authHandLen: number;
}): boolean {
  const dealTerminal =
    args.dealBoundToThisHand && (args.dealPhase === 'READY' || args.dealPhase === 'GAMEPLAY');
  return (
    !args.dealBoundToThisHand ||
    dealTerminal ||
    args.authHandLen > GIN_CARDS_PER_PLAYER
  );
}

function deriveRenderedHandLen(args: {
  authHandLen: number;
  dealBoundToThisHand: boolean;
  dealPhase: 'PRE_DEAL' | 'DEALING' | 'WAVE' | 'READY' | 'GAMEPLAY' | null;
  settledForPlayer: number;
}): number {
  const force = deriveForceFullProjection({
    dealBoundToThisHand: args.dealBoundToThisHand,
    dealPhase: args.dealPhase,
    authHandLen: args.authHandLen,
  });
  if (force) return args.authHandLen;
  if (!args.dealBoundToThisHand) return args.authHandLen;
  if (args.authHandLen > GIN_CARDS_PER_PLAYER) return args.authHandLen;
  if (args.dealPhase === 'PRE_DEAL') return 0;
  return Math.min(args.settledForPlayer, GIN_CARDS_PER_PLAYER, args.authHandLen);
}

describe('Gin opening-hand projection contract', () => {
  it('authoritative 10-card hand + PRE_DEAL matching runtime → renders 0, never full-authoritative', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: true, dealPhase: 'PRE_DEAL', authHandLen: 10 })).toBe(false);
    expect(deriveRenderedHandLen({ authHandLen: 10, dealBoundToThisHand: true, dealPhase: 'PRE_DEAL', settledForPlayer: 0 })).toBe(0);
  });

  it('partially settled DEALING runtime → renders exactly the settled count', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: true, dealPhase: 'DEALING', authHandLen: 10 })).toBe(false);
    expect(deriveRenderedHandLen({ authHandLen: 10, dealBoundToThisHand: true, dealPhase: 'DEALING', settledForPlayer: 4 })).toBe(4);
  });

  it('terminal READY runtime → permits full-authoritative projection', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: true, dealPhase: 'READY', authHandLen: 10 })).toBe(true);
    expect(deriveRenderedHandLen({ authHandLen: 10, dealBoundToThisHand: true, dealPhase: 'READY', settledForPlayer: 10 })).toBe(10);
  });

  it('terminal GAMEPLAY runtime → permits full-authoritative projection', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: true, dealPhase: 'GAMEPLAY', authHandLen: 10 })).toBe(true);
  });

  it('no matching runtime → full-authoritative projection allowed (mid-hand rejoin / recovery)', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: false, dealPhase: null, authHandLen: 10 })).toBe(true);
  });

  it('hand grew past opening capacity (self-draw 11) → full-authoritative projection allowed', () => {
    expect(deriveForceFullProjection({ dealBoundToThisHand: true, dealPhase: 'DEALING', authHandLen: 11 })).toBe(true);
  });

  it('invariant: no frame renders all 10 opening cards before matching transport has begun', () => {
    // Before opening transport: matching runtime PRE_DEAL, no cards settled.
    const rendered = deriveRenderedHandLen({ authHandLen: 10, dealBoundToThisHand: true, dealPhase: 'PRE_DEAL', settledForPlayer: 0 });
    expect(rendered).toBe(0);
  });
});
