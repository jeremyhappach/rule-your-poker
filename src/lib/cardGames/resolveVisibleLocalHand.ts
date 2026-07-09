/**
 * P0 cross-game invariant helper.
 *
 * Contract (see `.lovable/cardgames-visible-local-hand-inventory.md`):
 *
 *   Once the current hand/round identity is established AND the
 *   authoritative local player hand for that identity is non-empty,
 *   the UI must never render an empty local hand due to:
 *     - stale presentation / viewState
 *     - optimistic empty state
 *     - a transport (DealRuntime) stuck in PRE_DEAL / DEALING
 *     - readiness / interactionsAllowed / transition gates
 *     - stale handContextId mismatch
 *     - pane / tab remount
 *     - animation completion state
 *     - parent suppression gates
 *
 * The presentation layer may control ENTRANCE timing (card-by-card
 * reveal during the opening deal window), but it must not permanently
 * suppress authoritative cards after that window ends. Refresh /
 * hydration and live / realtime paths MUST converge on the same
 * visible hand.
 *
 * This helper is intentionally small. Games with more nuanced projection
 * (Gin's canonical settle counting, Cribbage's deal-runtime clipping)
 * inline their own gating and call this helper only as the final
 * self-heal decision. Do not over-abstract per-game deal projection here.
 */
export type LocalHandDecision =
  | 'render-presentation'
  | 'render-authoritative-self-heal'
  | 'render-empty-pre-deal'
  | 'render-empty-blocked-current-hand'
  | 'render-empty-no-authoritative';

export interface ResolveVisibleLocalHandArgs<Card> {
  /** Authoritative cards for the current hand identity — the DB truth. */
  authoritativeHand: readonly Card[] | null | undefined;
  /** Cards the presentation/projection layer wants to show (may be clipped). */
  presentationHand: readonly Card[];
  /**
   * True when the deal window has ended for this hand and the local
   * player is expected to see their full hand. Per-game games decide
   * (Cribbage: phase in discarding/cutting/pegging/counting; Gin: phase
   * in first_draw/playing/... AND authoritative hand is at capacity;
   * Poker-style: hand has reached showdown/betting phase).
   */
  isPostDealPhase: boolean;
  /**
   * If the parent has suppressed the pane (identity mismatch, transition
   * flash guard), pass true. Post-deal authoritative non-empty overrides
   * this — that's the whole point of the invariant.
   */
  parentSuppressed?: boolean;
  /**
   * Allow rendering empty during the opening deal window. Pass true
   * when the transport layer is legitimately holding cards back for
   * card-by-card reveal.
   */
  allowPreDealEmpty?: boolean;
}

export interface ResolveVisibleLocalHandResult<Card> {
  hand: readonly Card[];
  decision: LocalHandDecision;
}

export function resolveVisibleLocalHand<Card>(
  args: ResolveVisibleLocalHandArgs<Card>,
): ResolveVisibleLocalHandResult<Card> {
  const {
    authoritativeHand,
    presentationHand,
    isPostDealPhase,
    parentSuppressed = false,
    allowPreDealEmpty = false,
  } = args;

  const authCount = authoritativeHand?.length ?? 0;
  const presCount = presentationHand.length;

  // Rule 1 — post-deal authoritative wins over empty presentation.
  // This is the whole invariant. Parent suppression cannot beat this.
  if (isPostDealPhase && authCount > 0 && presCount === 0) {
    return {
      hand: authoritativeHand as readonly Card[],
      decision: 'render-authoritative-self-heal',
    };
  }

  // Rule 2 — parent suppression is honored ONLY when the invariant is
  // not being violated. If auth exists and we're post-deal, Rule 1 wins.
  if (parentSuppressed) {
    return { hand: [], decision: 'render-empty-blocked-current-hand' };
  }

  // Rule 3 — no authoritative cards yet: nothing to self-heal from.
  if (authCount === 0) {
    if (presCount > 0) {
      return { hand: presentationHand, decision: 'render-presentation' };
    }
    return {
      hand: [],
      decision: allowPreDealEmpty
        ? 'render-empty-pre-deal'
        : 'render-empty-no-authoritative',
    };
  }

  // Rule 4 — presentation is non-empty (possibly a legitimate partial
  // reveal); trust it.
  return { hand: presentationHand, decision: 'render-presentation' };
}
