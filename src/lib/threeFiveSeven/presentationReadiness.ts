export interface ThreeFiveSevenDealReadinessToken {
  handContextId: string;
  allowed: boolean;
}

export function isThreeFiveSevenDealPresentationReady(
  expectedHandContextId: string | null | undefined,
  token: ThreeFiveSevenDealReadinessToken | null | undefined,
): boolean {
  return !!expectedHandContextId
    && token?.handContextId === expectedHandContextId
    && token.allowed;
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
