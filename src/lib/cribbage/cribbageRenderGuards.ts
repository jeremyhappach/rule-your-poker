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

export type CribbageVisibleHandDecision =
  | 'render-authoritative-self-heal'
  | 'render-presentation'
  | 'render-empty-pre-deal'
  | 'render-empty-blocked-current-hand'
  | 'render-empty-no-authoritative';

/**
 * Opening-deal contract — DealRuntime lifecycle is the sole discriminator.
 *
 *   Lifecycle                              Visible hand
 *   -------------------------------------  ------------------------------
 *   phase past opening (pegging/counting)  self-heal to authoritative
 *   transport terminal (READY/GAMEPLAY)    self-heal to authoritative
 *   transport DEALING with progress        presentation subset
 *   transport DEALING idle / PRE_DEAL      empty (awaiting transport)
 *
 * There is no wall-clock grace / stall fuse here. Canonical transport
 * owns recovery for missing endpoints via endpoint retry → __markDropped
 * → settled → READY, which naturally lifts visibility through the
 * terminal branch above.
 */
export function resolveCribbageVisibleHand(args: ResolveCribbageVisibleHandArgs): {
  hand: readonly CribbageCard[];
  decision: CribbageVisibleHandDecision;
  reason: string;
} {
  const authoritative = args.authoritativeHand ?? null;
  const authCount = authoritative?.length ?? 0;
  const presentation = args.presentationHand;
  const presCount = presentation.length;
  const dealPhase = args.dealPhase ?? null;
  const activeIntents = args.dealActiveIntentCount ?? 0;
  const parentSuppressed = !!args.parentSuppressed;

  const isOpeningPhase = args.phase === 'discarding' || args.phase === 'dealing';
  const isPost = isCribbagePostDealPhase(args.phase);

  const transportTerminal = dealPhase === 'READY' || dealPhase === 'GAMEPLAY';
  const transportInFlight = dealPhase === 'DEALING' && activeIntents > 0;

  // Phase past opening-deal window: opening is complete by contract.
  if (isPost && !isOpeningPhase) {
    if (authCount > 0 && presCount < authCount) {
      return {
        hand: authoritative as readonly CribbageCard[],
        decision: 'render-authoritative-self-heal',
        reason: 'phase past opening-deal window; presentation stale',
      };
    }
    return {
      hand: presentation,
      decision: 'render-presentation',
      reason: 'phase past opening-deal window; presentation matches',
    };
  }

  // Transport terminalized — authoritative is the source of truth.
  if (transportTerminal) {
    if (authCount > 0 && presCount < authCount) {
      return {
        hand: authoritative as readonly CribbageCard[],
        decision: 'render-authoritative-self-heal',
        reason: 'transport terminalized (READY/GAMEPLAY); presentation stale',
      };
    }
    return {
      hand: presentation,
      decision: 'render-presentation',
      reason: 'transport terminalized; presentation caught up',
    };
  }

  // In-flight deal with visible progress: canonical transport ownership
  // is the authoritative source during the deal window. The parent's
  // `parentSuppressed` gate is action-legality (interactionsAllowed),
  // not render-legality — during opening deal it can transiently be
  // false while presentation identity catches up, and honoring it here
  // would mask each settled card and then batch-reveal them all at
  // once when identity converges. When transport has produced a
  // non-empty settled prefix, presentation wins.
  if (transportInFlight && presCount > 0) {
    return {
      hand: presentation,
      decision: 'render-presentation',
      reason: 'in-flight deal; rendering settled prefix (parent action-gate ignored)',
    };
  }

  // Parent suppression during a non-terminal deal lifecycle with no
  // settled prefix yet: nothing to show anyway; honor it.
  if (parentSuppressed) {
    return {
      hand: [],
      decision: 'render-empty-blocked-current-hand',
      reason: 'parent suppressed within non-terminal deal lifecycle (no settled prefix)',
    };
  }


  if (presCount > 0) {
    return {
      hand: presentation,
      decision: 'render-presentation',
      reason: 'presentation available during deal lifecycle',
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
    decision: 'render-empty-pre-deal',
    reason: 'awaiting DealRuntime lifecycle progress',
  };
}


