import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
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
    // NB: intentionally does NOT require currentHandKey. When live/realtime
    // viewState is null or stale, currentHandKey is empty — but the parent
    // must still enter gameplay-render mode if authoritative post-deal
    // state exists with a non-empty hand. This is the invariant.
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
  /**
   * Bounded grace flag owned by the consumer. Reset on every hand-identity
   * boundary; flips true after ~2s if the deal transport has neither begun
   * nor completed. Only relevant while `phase === 'discarding' | 'dealing'`.
   */
  graceExpired?: boolean;
}

export type CribbageVisibleHandDecision =
  | 'render-authoritative-self-heal'
  | 'render-presentation'
  | 'render-empty-pre-deal'
  | 'render-empty-blocked-current-hand'
  | 'render-empty-no-authoritative';

/**
 * Opening-deal timing contract.
 *
 * The prior implementation delegated to `resolveVisibleLocalHand`, whose
 * Rule 1 fires authoritative-self-heal whenever `isPostDealPhase && auth>0
 * && pres===0`. During a fresh Cribbage deal the DB authoritative state
 * flips to `discarding` with 6 cards BEFORE `CardTransport.beginDeal` runs,
 * so the resolver immediately flashed the full hand ahead of the animation.
 *
 * The new contract: during a valid opening-deal window (phase discarding
 * with transport pre-start or DEALING), presentation owns the visible hand.
 * Self-heal only fires when transport has clearly failed to progress
 * (activeIntents === 0 with `graceExpired`), transport terminalized to
 * READY/GAMEPLAY, or phase is past discarding (pegging/counting/cutting),
 * where the deal window is definitionally over.
 */
export function resolveCribbageVisibleHand(args: ResolveCribbageVisibleHandArgs): {
  hand: readonly CribbageCard[];
  decision: CribbageVisibleHandDecision;
  reason: string;
} {
  const isPost = isCribbagePostDealPhase(args.phase);
  const authCount = args.authoritativeHand?.length ?? 0;
  const presentation = args.presentationHand;
  const presCount = presentation.length;
  const dealPhase = args.dealPhase ?? null;
  const activeIntents = args.dealActiveIntentCount ?? 0;
  const expectedCount = args.dealExpectedCount ?? 0;
  const graceExpired = !!args.graceExpired;
  const parentSuppressed = !!args.parentSuppressed;

  // The opening deal only happens in `discarding` (or the transient
  // `dealing` boundary). After discarding is over the deal window is
  // definitionally closed and self-heal may fire immediately when
  // presentation is stale.
  const isOpeningPhase = args.phase === 'discarding' || args.phase === 'dealing';

  const transportTerminal = dealPhase === 'READY' || dealPhase === 'GAMEPLAY';
  const transportInFlight = dealPhase === 'DEALING' && activeIntents > 0;
  // Transport says it's dealing but nothing is in flight yet: could be the
  // very first tick after `beginDeal`, or a stuck/abandoned batch.
  const transportDealingIdle = dealPhase === 'DEALING' && activeIntents === 0;
  // Transport hasn't been told to start yet (PRE_DEAL with no expected count,
  // or no provider at all).
  const transportPreStart =
    (dealPhase === null || dealPhase === 'PRE_DEAL') && expectedCount === 0;

  // Valid deal window: presentation is authorized to render 0/subset without
  // self-heal firing.
  const dealWindowActive =
    isOpeningPhase &&
    !transportTerminal &&
    (
      transportInFlight ||
      ((transportDealingIdle || transportPreStart) && !graceExpired)
    );

  // Self-heal fires when authoritative post-deal cards exist, presentation
  // is missing/partial, and the deal window is NOT actively animating.
  if (isPost && authCount > 0 && presCount < authCount && !dealWindowActive) {
    return {
      hand: args.authoritativeHand as readonly CribbageCard[],
      decision: 'render-authoritative-self-heal',
      reason:
        transportTerminal
          ? 'transport terminalized; presentation stale'
          : !isOpeningPhase
            ? 'post-opening phase; deal window closed'
            : parentSuppressed
              ? 'parent suppressed after grace window'
              : 'transport not progressing after grace window',
    };
  }

  if (parentSuppressed) {
    return {
      hand: [],
      decision: 'render-empty-blocked-current-hand',
      reason: 'parent suppressed within deal window',
    };
  }

  if (presCount > 0) {
    return {
      hand: presentation,
      decision: 'render-presentation',
      reason: 'presentation subset within valid deal window',
    };
  }

  if (dealWindowActive) {
    return {
      hand: [],
      decision: 'render-empty-pre-deal',
      reason: 'opening-deal window active; awaiting transport reveal',
    };
  }

  if (authCount === 0) {
    return {
      hand: [],
      decision: 'render-empty-no-authoritative',
      reason: 'no authoritative hand yet',
    };
  }

  // Non-post-deal phase with authoritative cards but self-heal ineligible.
  return {
    hand: [],
    decision: 'render-empty-blocked-current-hand',
    reason: 'authoritative present but phase is not post-deal',
  };
}

