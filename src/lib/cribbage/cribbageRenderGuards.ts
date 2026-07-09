import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
import { resolveVisibleLocalHand } from '@/lib/cardGames/resolveVisibleLocalHand';
import type { DealPhase } from '@/lib/canonicalShell/cardTransport/types';

export function isCribbagePostDealPhase(phase: CribbageState['phase'] | undefined): boolean {
  return phase === 'discarding' || phase === 'cutting' || phase === 'pegging' || phase === 'counting';
}

export function cribbageAuthoritativeHandCounts(state: CribbageState | null | undefined): Record<string, number> {
  if (!state) return {};
  return Object.fromEntries(
    Object.entries(state.playerStates ?? {}).map(([playerId, playerState]) => [
      playerId,
      Array.isArray(playerState.hand) ? playerState.hand.length : 0,
    ]),
  );
}

export function hasAnyCribbageAuthoritativeHand(state: CribbageState | null | undefined): boolean {
  return Object.values(cribbageAuthoritativeHandCounts(state)).some((count) => count > 0);
}

export interface CribbageParentRenderModeArgs {
  isDealerSelection: boolean;
  isHighCardMode: boolean;
  initialLoadComplete: boolean;
  renderHandKey: string;
  currentHandKey: string;
  currentPlayerId: string | undefined;
  isObserver: boolean;
  isStaleCompleteAwaitingNext: boolean;
  authoritativeState: CribbageState | null;
}

export interface CribbageParentRenderMode {
  viewStateIsCurrentRound: boolean;
  parentAuthoritativeGameplayFallback: boolean;
  isBootstrapMode: boolean;
  isGameplayMode: boolean;
}

export function deriveCribbageParentRenderMode(args: CribbageParentRenderModeArgs): CribbageParentRenderMode {
  const viewStateIsCurrentRound = !!(
    args.renderHandKey &&
    args.currentHandKey &&
    args.renderHandKey === args.currentHandKey
  );

  const parentAuthoritativeGameplayFallback = !!(
    !args.isHighCardMode &&
    !args.isDealerSelection &&
    args.currentHandKey &&
    args.authoritativeState &&
    isCribbagePostDealPhase(args.authoritativeState.phase) &&
    hasAnyCribbageAuthoritativeHand(args.authoritativeState)
  );

  const isBootstrapMode = !args.isDealerSelection && !parentAuthoritativeGameplayFallback && (
    !args.initialLoadComplete ||
    !args.renderHandKey ||
    (!args.currentPlayerId && !args.isObserver) ||
    args.isStaleCompleteAwaitingNext
  );

  const isGameplayMode = !!(
    !args.isHighCardMode &&
    (
      (!isBootstrapMode && viewStateIsCurrentRound) ||
      parentAuthoritativeGameplayFallback
    )
  );

  return {
    viewStateIsCurrentRound,
    parentAuthoritativeGameplayFallback,
    isBootstrapMode,
    isGameplayMode,
  };
}

export interface ResolveCribbageVisibleHandArgs {
  authoritativeHand: readonly CribbageCard[] | null | undefined;
  presentationHand: readonly CribbageCard[];
  phase: CribbageState['phase'];
  parentSuppressed?: boolean;
  dealPhase?: DealPhase | null;
  dealExpectedCount?: number;
  dealActiveIntentCount?: number;
}

export function resolveCribbageVisibleHand(args: ResolveCribbageVisibleHandArgs) {
  const base = resolveVisibleLocalHand({
    authoritativeHand: args.authoritativeHand,
    presentationHand: args.presentationHand,
    isPostDealPhase: isCribbagePostDealPhase(args.phase),
    parentSuppressed: args.parentSuppressed,
    allowPreDealEmpty: args.phase === 'dealing',
  });

  const authCount = args.authoritativeHand?.length ?? 0;
  const renderedCount = base.hand.length;
  const transportFinishedOrAbandoned = !!(
    args.dealPhase &&
    args.dealPhase !== 'READY' &&
    args.dealPhase !== 'GAMEPLAY' &&
    (args.dealExpectedCount ?? 0) > 0 &&
    (args.dealActiveIntentCount ?? 0) === 0
  );

  if (
    isCribbagePostDealPhase(args.phase) &&
    authCount > 0 &&
    renderedCount < authCount &&
    transportFinishedOrAbandoned
  ) {
    return {
      hand: args.authoritativeHand as readonly CribbageCard[],
      decision: 'render-authoritative-self-heal' as const,
      reason: 'authoritative non-empty; transport finished/abandoned with partial presentation',
    };
  }

  return { ...base, reason: base.decision };
}
