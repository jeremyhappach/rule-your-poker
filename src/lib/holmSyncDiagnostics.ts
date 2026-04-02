/**
 * Holm-specific sync diagnostics: state summaries + invariant checks.
 *
 * Uses the reusable patterns from debugSyncInvariants.ts.
 * Prefix: [holm-sync]
 */

import { checkInvariant, logSyncSummary } from './debugSyncInvariants';
import type { HolmAuthoritativeSnapshot } from '@/lib/gameStateSync/holmProgress';

// ── Phase rules ───────────────────────────────────────────────

const PHASE_MAX_REVEALED: Record<string, number> = {
  betting: 2,
  processing: 2,
  showdown: 4,
  completed: 4,
};

// ── Holm state summary ────────────────────────────────────────

export interface HolmSyncSummary {
  gameId: string;
  handNumber: number;
  roundStatus: string;
  decidedCount: number;
  progressVector: number[];
  communityCardsRevealed: number;
  effectiveVisibleCommunityCount: number;
  playerCardCounts: Record<string, number>;
  communityCardIdentity: string;
  visibleCommunityCards: string[];
  evaluationResult?: string | null;
  sourceIdentity?: string;
}

/**
 * Build a compact summary of the current Holm presentation state.
 */
export function buildHolmSyncSummary(
  gameId: string,
  presentation: HolmAuthoritativeSnapshot | null,
  effectiveRevealed: number,
  playerCards?: Array<{ playerId: string; cards: unknown[] }>,
  evaluationResult?: string | null,
): HolmSyncSummary | null {
  if (!presentation) return null;

  const decidedCount = presentation.players.filter(p => p.decisionLocked).length;
  const communityArr = (presentation.communityCards ?? []) as Array<{ rank?: string; suit?: string }>;

  const playerCardCounts: Record<string, number> = {};
  if (playerCards) {
    for (const pc of playerCards) {
      playerCardCounts[pc.playerId.slice(0, 8)] = pc.cards?.length ?? 0;
    }
  }

  return {
    gameId: gameId.slice(0, 8),
    handNumber: presentation.handNumber,
    roundStatus: presentation.roundStatus,
    decidedCount,
    progressVector: [
      presentation.handNumber,
      ({ betting: 0, processing: 1, showdown: 2, completed: 3 }[presentation.roundStatus]) ?? 0,
      decidedCount,
      presentation.communityCardsRevealed,
    ],
    communityCardsRevealed: presentation.communityCardsRevealed,
    effectiveVisibleCommunityCount: effectiveRevealed,
    playerCardCounts,
    communityCardIdentity: communityArr.map(c => `${c.rank ?? '?'}${c.suit ?? '?'}`).join(','),
    visibleCommunityCards: communityArr
      .slice(0, effectiveRevealed)
      .map(c => `${c.rank ?? '?'}${c.suit ?? '?'}`),
    evaluationResult: evaluationResult ?? null,
  };
}

/**
 * Log a Holm sync summary at a specific boundary.
 */
export function logHolmSummary(
  label: string,
  summary: HolmSyncSummary | null,
): void {
  if (!summary) return;
  logSyncSummary('holm-sync', label, summary as unknown as Record<string, unknown>);
}

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
): boolean {
  if (!evaluationResult) return true; // No evaluation shown, skip

  const renderedStr = renderedCommunityCards.join(',');
  const presentationStr = presentationCommunityCards.join(',');

  return checkInvariant(
    'holm',
    'eval-render-coherence',
    renderedStr === presentationStr,
    `Rendered board (${renderedStr}) differs from presentation board (${presentationStr}) while evaluation "${evaluationResult}" is displayed`,
    { renderedCommunityCards, presentationCommunityCards, evaluationResult, handNumber },
  );
}

/**
 * INV-3: Phase/render mismatch.
 * Betting/decision phase must not render showdown-level card exposure (>2).
 */
export function checkPhaseRenderMismatch(
  roundStatus: string,
  effectiveRevealed: number,
  handNumber: number,
): boolean {
  if (roundStatus !== 'betting' && roundStatus !== 'processing') return true;

  return checkInvariant(
    'holm',
    'phase-render-mismatch',
    effectiveRevealed <= 2,
    `Betting/processing phase rendering ${effectiveRevealed} cards (max 2 allowed)`,
    { roundStatus, effectiveRevealed, handNumber },
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
  roundStatus: string;
  effectiveRevealed: number;
  handNumber: number;
  handKey: string;
  renderedCommunityCards?: string[];
  presentationCommunityCards?: string[];
  evaluationResult?: string | null;
}): boolean {
  const {
    roundStatus,
    effectiveRevealed,
    handNumber,
    handKey,
    renderedCommunityCards,
    presentationCommunityCards,
    evaluationResult,
  } = params;

  let allPass = true;
  allPass = checkPrematureReveal(roundStatus, effectiveRevealed, handNumber) && allPass;
  allPass = checkPhaseRenderMismatch(roundStatus, effectiveRevealed, handNumber) && allPass;
  allPass = checkRegressiveReveal(handKey, effectiveRevealed) && allPass;

  if (renderedCommunityCards && presentationCommunityCards) {
    allPass = checkEvalRenderCoherence(
      renderedCommunityCards,
      presentationCommunityCards,
      evaluationResult ?? null,
      handNumber,
    ) && allPass;
  }

  return allPass;
}
