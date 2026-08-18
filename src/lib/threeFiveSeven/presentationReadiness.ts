export interface ThreeFiveSevenDealReadinessToken {
  handContextId: string;
  waveContextId: string;
  roundId: string;
  roundNumber: number;
  allowed: boolean;
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
  if (args.historicalEntry && args.runtimeExpectedCount === 0) return true;
  return args.runtimeExpectedCount === args.expectedCumulativeCount;
}

export function resolveThreeFiveSevenDealerGameScope(
  primaryDealerGameId: string | null | undefined,
  secondaryDealerGameId: string | null | undefined,
): string | null {
  return primaryDealerGameId ?? secondaryDealerGameId ?? null;
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
