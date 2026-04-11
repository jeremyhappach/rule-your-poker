/**
 * Holm-specific sync diagnostics: state summaries + invariant checks.
 *
 * Uses the reusable patterns from debugSyncInvariants.ts.
 * Prefix: [holm-sync]
 */

import { checkInvariant } from './debugSyncInvariants';
import type { HolmAuthoritativeSnapshot } from '@/lib/gameStateSync/holmProgress';

// ── Phase rules ───────────────────────────────────────────────

const PHASE_MAX_REVEALED: Record<string, number> = {
  betting: 2,
  processing: 4, // processing + all_decisions_in can legitimately have 4
  showdown: 4,
  completed: 4,
};


// ── Holm invariant checks ─────────────────────────────────────

/**
 * INV-1: Premature reveal.
 * If not in showdown/completed, visible community count must not exceed phase limit.
 */
export function checkPrematureReveal(
  roundStatus: string,
  effectiveRevealed: number,
  handNumber: number,
  gameId?: string,
): boolean {
  const maxAllowed = PHASE_MAX_REVEALED[roundStatus] ?? 2;
  return checkInvariant(
    'holm',
    'premature-reveal',
    effectiveRevealed <= maxAllowed,
    `Effective revealed (${effectiveRevealed}) exceeds phase limit (${maxAllowed}) for phase "${roundStatus}"`,
    { roundStatus, effectiveRevealed, maxAllowed, handNumber, gameId: gameId ?? '' },
  );
}

/**
 * INV-2: Evaluation/render coherence.
 * When result banner is shown, the rendered board must match the presentation snapshot.
 */
export function checkEvalRenderCoherence(
  renderedCommunityCards: string[],
  presentationCommunityCards: string[],
  evaluationResult: string | null,
  handNumber: number,
  gameId?: string,
): boolean {
  if (!evaluationResult) return true;

  const renderedStr = renderedCommunityCards.join(',');
  const presentationStr = presentationCommunityCards.join(',');

  return checkInvariant(
    'holm',
    'eval-render-coherence',
    renderedStr === presentationStr,
    `Rendered board (${renderedStr}) differs from presentation board (${presentationStr}) while evaluation "${evaluationResult}" is displayed`,
    { renderedCommunityCards, presentationCommunityCards, evaluationResult, handNumber, gameId: gameId ?? '' },
  );
}

/**
 * INV-3: Phase/render mismatch.
 * Betting phase must not render showdown-level card exposure (>2).
 * Processing phase with all_decisions_in=true is allowed to show 4 (reveal sequence in progress).
 */
export function checkPhaseRenderMismatch(
  roundStatus: string,
  effectiveRevealed: number,
  handNumber: number,
  gameId?: string,
  allDecisionsIn?: boolean,
): boolean {
  if (roundStatus === 'betting') {
    return checkInvariant(
      'holm',
      'phase-render-mismatch',
      effectiveRevealed <= 2,
      `Betting phase rendering ${effectiveRevealed} cards (max 2 allowed)`,
      { roundStatus, effectiveRevealed, handNumber, gameId: gameId ?? '' },
    );
  }
  if (roundStatus === 'processing' && !allDecisionsIn) {
    return checkInvariant(
      'holm',
      'phase-render-mismatch',
      effectiveRevealed <= 2,
      `Processing phase (pre-decision) rendering ${effectiveRevealed} cards (max 2 allowed)`,
      { roundStatus, effectiveRevealed, allDecisionsIn, handNumber, gameId: gameId ?? '' },
    );
  }
  return true;
}

/**
 * INV-5: Chucky dealt before community reveal.
 * If chucky is active, the effective visible community count must be 4.
 */
export function checkChuckyBeforeReveal(
  chuckyActive: boolean,
  effectiveRevealed: number,
  handNumber: number,
  gameId?: string,
): boolean {
  if (!chuckyActive) return true;
  return checkInvariant(
    'holm',
    'chucky-before-community-reveal',
    effectiveRevealed >= 4,
    `Chucky is active but only ${effectiveRevealed} community cards visible (expected 4)`,
    { chuckyActive, effectiveRevealed, handNumber, gameId: gameId ?? '' },
  );
}

/**
 * INV-4: Regressive reveal.
 * Within a hand, reveal count must not decrease unless identity changes.
 */
const lastRevealPerHand = new Map<string, number>();

export function checkRegressiveReveal(
  handKey: string,
  effectiveRevealed: number,
): boolean {
  const prev = lastRevealPerHand.get(handKey);

  if (prev !== undefined && effectiveRevealed < prev) {
    const result = checkInvariant(
      'holm',
      'regressive-reveal',
      false,
      `Reveal count regressed from ${prev} to ${effectiveRevealed} within hand "${handKey}"`,
      { handKey, previousRevealed: prev, currentRevealed: effectiveRevealed },
    );
    // Update anyway so we don't spam
    lastRevealPerHand.set(handKey, effectiveRevealed);
    return result;
  }

  lastRevealPerHand.set(handKey, effectiveRevealed);
  return true;
}

/** Clear tracking on hand boundary */
export function resetRegressiveRevealTracking(handKey: string): void {
  lastRevealPerHand.delete(handKey);
}

/**
 * Run all Holm invariants in one call.
 * Returns true if all pass.
 */
export function runHolmInvariants(params: {
  gameId?: string;
  roundStatus: string;
  effectiveRevealed: number;
  handNumber: number;
  handKey: string;
  allDecisionsIn?: boolean;
  chuckyActive?: boolean;
  renderedCommunityCards?: string[];
  presentationCommunityCards?: string[];
  evaluationResult?: string | null;
}): boolean {
  const {
    gameId,
    roundStatus,
    effectiveRevealed,
    handNumber,
    handKey,
    allDecisionsIn,
    chuckyActive,
    renderedCommunityCards,
    presentationCommunityCards,
    evaluationResult,
  } = params;

  let allPass = true;
  allPass = checkPrematureReveal(roundStatus, effectiveRevealed, handNumber, gameId) && allPass;
  allPass = checkPhaseRenderMismatch(roundStatus, effectiveRevealed, handNumber, gameId, allDecisionsIn) && allPass;
  allPass = checkRegressiveReveal(handKey, effectiveRevealed) && allPass;
  allPass = checkChuckyBeforeReveal(chuckyActive ?? false, effectiveRevealed, handNumber, gameId) && allPass;

  if (renderedCommunityCards && presentationCommunityCards) {
    allPass = checkEvalRenderCoherence(
      renderedCommunityCards,
      presentationCommunityCards,
      evaluationResult ?? null,
      handNumber,
      gameId,
    ) && allPass;
  }

  return allPass;
}

// ── INV-6: Solo player presentation mismatch ─────────────────

/**
 * Track the previous hand's solo player to detect stale re-locking.
 */
const lastSoloCapture = { handContextId: '', playerId: '' };

/**
 * INV-6: Featured solo player mismatch.
 * When the presentation layer selects a solo/featured player for tabling,
 * verify it hasn't re-locked the previous hand's solo player due to stale
 * current_decision. Fires when the same player is locked in consecutive
 * hands with different handContextIds.
 */
export function checkSoloPlayerMismatch(
  lockedPlayerId: string | null,
  currentUserId: string | undefined,
  handContextId: string,
  gameId?: string,
): boolean {
  if (!lockedPlayerId || !handContextId) return true;

  const prevContext = lastSoloCapture.handContextId;
  const prevPlayer = lastSoloCapture.playerId;

  // Same context + same player = benign re-trigger, skip entirely
  if (prevContext === handContextId && prevPlayer === lockedPlayerId) return true;

  // Detect: same player locked as solo in two consecutive DIFFERENT hands
  const isStaleRelock =
    prevPlayer === lockedPlayerId &&
    prevContext !== '' &&
    prevContext !== handContextId;

  // Update tracking BEFORE building payload so it's clean for next call
  lastSoloCapture.handContextId = handContextId;
  lastSoloCapture.playerId = lockedPlayerId;

  if (!isStaleRelock) return true;

  return checkInvariant(
    'holm',
    'solo-player-stale-relock',
    false,
    `Solo player ${lockedPlayerId.slice(0, 8)} re-locked across hand boundary (prev: ${prevContext.slice(0, 16)}, current: ${handContextId.slice(0, 16)})`,
    {
      lockedPlayerId,
      currentUserId: currentUserId ?? '',
      handContextId,
      previousHandContextId: prevContext,
      gameId: gameId ?? '',
    },
  );
}

/** Reset solo player tracking on unmount / game change */
export function resetSoloPlayerTracking(): void {
  lastSoloCapture.handContextId = '';
  lastSoloCapture.playerId = '';
}


/**
 * INV-8: Card fetch roundId mismatch.
 * Fires when a card fetch response arrives for a roundId that no longer
 * matches the current active round, indicating a stale response.
 */
export function checkCardFetchRoundMismatch(
  gameId: string,
  handNumber: number,
  fetchedRoundId: string,
  currentRoundId: string | null,
): boolean {
  if (!currentRoundId || fetchedRoundId === currentRoundId) return true;
  return checkInvariant(
    'holm',
    'card-fetch-round-mismatch',
    false,
    `Card fetch returned for round ${fetchedRoundId.slice(0, 8)} but current round is ${currentRoundId.slice(0, 8)}`,
    { gameId, handNumber, fetchedRoundId, currentRoundId },
  );
}
