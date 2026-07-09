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
   * Named last-resort stall fuse. Owned by the consumer, in-memory,
   * bounded, reset on hand-identity boundary. This flag ONLY influences
   * the decision when the deal-transport lifecycle has not produced any
   * observable progress for the current hand (pre-start or dealing-idle).
   * It is NEVER the discriminator for terminal transport, in-flight
   * transport, or phases past the opening-deal window.
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
 * Opening-deal contract.
 *
 * The prior "always self-heal post-deal when auth>0 && pres===0" rule
 * regressed the opening-deal window: the DB flips to `discarding` with
 * 6 cards BEFORE the orchestrator calls `beginDeal`, so the resolver
 * flashed the full hand ahead of the animation.
 *
 * The primary discriminator here is the deal-transport LIFECYCLE for
 * the current hand, not a timer:
 *
 *   Lifecycle                          Visible hand
 *   ---------------------------------  ------------------------------
 *   transportInFlight                  presentation subset
 *   transportTerminal (READY/GAMEPLAY) self-heal to authoritative if
 *                                        presentation stale
 *   phase past `discarding`            self-heal immediately
 *   transportPreStart or               presentation (empty OK). Fallback
 *     transportDealingIdle               ONLY: if graceExpired AND
 *                                        auth cards exist, self-heal —
 *                                        the "no transport lifecycle
 *                                        ever arrived" stall fuse.
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

  // Opening-deal window only exists in `discarding` (or the transient
  // `dealing` phase). Once phase advances the window is closed.
  const isOpeningPhase = args.phase === 'discarding' || args.phase === 'dealing';

  // Primary lifecycle discriminators.
  const transportTerminal = dealPhase === 'READY' || dealPhase === 'GAMEPLAY';
  const transportInFlight = dealPhase === 'DEALING' && activeIntents > 0;
  const transportDealingIdle = dealPhase === 'DEALING' && activeIntents === 0;
  const transportPreStart =
    (dealPhase === null || dealPhase === 'PRE_DEAL') && expectedCount === 0;

  // Grace ONLY relaxes pre-start / dealing-idle — never in-flight,
  // terminal, or post-opening-phase.
  const dealWindowActive =
    isOpeningPhase &&
    !transportTerminal &&
    (
      // In-flight transport owns the window while it is making visible
      // progress (or while the bounded stall fuse has not expired). Under
      // chaos, an active intent can remain stuck before any local card is
      // visible; after the fuse expires, authoritative cards must recover
      // the no-card UI instead of waiting forever on that intent.
      (transportInFlight && (!graceExpired || presCount > 0)) ||
      ((transportDealingIdle || transportPreStart) && !graceExpired)
    );

  if (isPost && authCount > 0 && presCount < authCount && !dealWindowActive) {
    return {
      hand: args.authoritativeHand as readonly CribbageCard[],
      decision: 'render-authoritative-self-heal',
      reason:
        transportTerminal
          ? 'transport terminalized (READY/GAMEPLAY); presentation stale'
          : !isOpeningPhase
            ? 'phase past opening-deal window; deal-window closed'
            : parentSuppressed
              ? 'parent suppressed; stall fuse tripped'
              : 'transport lifecycle absent; stall fuse tripped',
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

  return {
    hand: [],
    decision: 'render-empty-blocked-current-hand',
    reason: 'authoritative present but phase is not post-deal',
  };
}

