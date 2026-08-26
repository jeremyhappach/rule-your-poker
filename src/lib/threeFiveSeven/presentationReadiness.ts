export interface ThreeFiveSevenDealReadinessToken {
  handContextId: string;
  waveContextId: string;
  roundId: string;
  roundNumber: number;
  allowed: boolean;
  source?: 'transport' | 'authoritative-fallback' | 'blocked';
}

export function isThreeFiveSevenDealPresentationReady(
  expected: {
    handContextId: string | null | undefined;
    waveContextId: string | null | undefined;
    roundId: string | null | undefined;
    roundNumber: number | null | undefined;
  },
  token: ThreeFiveSevenDealReadinessToken | null | undefined,
): boolean {
  return !!expected.handContextId
    && !!expected.waveContextId
    && !!expected.roundId
    && token?.handContextId === expected.handContextId
    && token.waveContextId === expected.waveContextId
    && token.roundId === expected.roundId
    && token.roundNumber === expected.roundNumber
    && token.allowed;
}

export function isThreeFiveSevenRuntimeWaveReady(args: {
  runtimeAllowed: boolean;
  runtimeExpectedCount: number;
  expectedCumulativeCount: number;
  historicalEntry: boolean;
}): boolean {
  if (!args.runtimeAllowed) return false;
  return args.runtimeExpectedCount === args.expectedCumulativeCount;
}

/**
 * A live, identity-matched private hand is authoritative evidence that the
 * player may act. It is allowed to recover a missing local transport receipt,
 * but never historical, incomplete, or non-betting state.
 */
export function isThreeFiveSevenAuthoritativeFallbackReady(args: {
  historicalEntry: boolean;
  gameStatus: string | null | undefined;
  roundStatus: string | null | undefined;
  handContextId: string | null | undefined;
  waveContextId: string | null | undefined;
  roundId: string | null | undefined;
  roundNumber: number | null | undefined;
  authoritativeSelfCardCount: number;
  expectedSelfCardCount: number;
}): boolean {
  return (
    !args.historicalEntry &&
    args.gameStatus === 'in_progress' &&
    args.roundStatus === 'betting' &&
    !!args.handContextId &&
    !!args.waveContextId &&
    !!args.roundId &&
    typeof args.roundNumber === 'number' &&
    args.roundNumber >= 1 &&
    args.expectedSelfCardCount > 0 &&
    args.authoritativeSelfCardCount >= args.expectedSelfCardCount
  );
}

export function resolveThreeFiveSevenDealerGameScope(
  primaryDealerGameId: string | null | undefined,
  secondaryDealerGameId: string | null | undefined,
): string | null {
  return primaryDealerGameId ?? secondaryDealerGameId ?? null;
}

/**
 * A terminal trigger remains route-owned until presentation completion. That
 * durable local receipt lets a remounted table resume the exact immutable
 * terminal descriptor while the authoritative postgame handoff temporarily
 * has no current dealer game. A different concrete dealer game always wins
 * and rejects the stale presentation.
 */
export function canAdmitThreeFiveSevenTerminalPresentation({
  descriptorDealerGameId,
  activeDealerGameId,
  activeTriggerId,
}: {
  descriptorDealerGameId: string | null | undefined;
  activeDealerGameId: string | null | undefined;
  activeTriggerId: string | null | undefined;
}): boolean {
  if (!descriptorDealerGameId || !activeTriggerId) return false;
  return activeDealerGameId == null || activeDealerGameId === descriptorDealerGameId;
}

interface ThreeFiveSevenLegRetirementArgs {
  activeDealerGameId: string | null | undefined;
  retiredDealerGameId: string | null | undefined;
}

export function isThreeFiveSevenLegStackRetired({
  activeDealerGameId,
  retiredDealerGameId,
}: ThreeFiveSevenLegRetirementArgs): boolean {
  return !!retiredDealerGameId
    && (activeDealerGameId == null || activeDealerGameId === retiredDealerGameId);
}

interface ThreeFiveSevenLegDisplayArgs {
  effectiveLegs: number;
  isIncomingLegAnimating: boolean;
  isNormalTerminalFinalLegAward: boolean;
  legsToWin: number;
}

export function resolveThreeFiveSevenStaticLegCount({
  effectiveLegs,
  isIncomingLegAnimating,
  isNormalTerminalFinalLegAward,
  legsToWin,
}: ThreeFiveSevenLegDisplayArgs): number {
  const targetLegs = Math.max(0, legsToWin);
  if (isNormalTerminalFinalLegAward) {
    return Math.max(0, targetLegs - 1);
  }

  const visibleLegs = isIncomingLegAnimating
    ? effectiveLegs - 1
    : effectiveLegs;
  return Math.min(Math.max(0, visibleLegs), targetLegs);
}
