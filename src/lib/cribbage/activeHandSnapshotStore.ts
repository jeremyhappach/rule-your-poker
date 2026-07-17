/**
 * Cribbage Active-Hand Snapshot Store — instrumentation-only.
 *
 * Purpose: expose the live Cribbage active-hand presentation state at
 * the exact moment a visual bug report is submitted, so the report
 * carries a diagnostic snapshot rather than only bookkeeping.
 *
 * Contract:
 * - Read-only wrt gameplay. Publishing MUST NOT alter any rendering,
 *   lifecycle, transport, or scoring behavior.
 * - Reuses the existing bounded Cribbage Active-Hand Visibility Ledger
 *   (`activeHandVisibilityLedger.ts`) — no new ledger, no new producer,
 *   no new wartime system.
 * - Presence of a non-null published snapshot is itself the mounted-
 *   game discriminator: only `CribbageMobileCardsTab` publishes here,
 *   and it unmounts (clearing the store) when the Cribbage surface
 *   goes away. This bypasses persisted `games.game_type` mismatches.
 */

import { exportCribbageActiveHandText } from './activeHandVisibilityLedger';

export interface CribbageActiveHandSnapshotPublished {
  viewerPlayerId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  authoritativeHandCount: number;
  sourceHandCount: number;
  presentationHandCount: number;
  clippedHandCount: number;
  renderedHandCount: number;
  resolverDecision: string | null;
  resolverReason: string | null;
  decisionKind: string | null;
  dealPhase: string | null;
  activeIntentCountForHand: number | null;
  settledCardCountForViewer: number | null;
  cribbagePhase: string | null;
  renderHandKey: string | null;
  currentHandKey: string | null;
  parentSuppressed: boolean;
  activeHandBlocked: boolean;
  roundIdentityMismatch: boolean;
  handIdentityMismatch: boolean;
  emptyStageEarlyReturnActive: boolean;
  dealingPartialRevealActive: boolean;
}

export interface CribbageActiveHandCapturedSnapshot
  extends CribbageActiveHandSnapshotPublished {
  activeHandDomWrapperCount: number;
  activeHandDomCardCount: number;
  authoritativeCardsButEmptyDom: boolean;
  ledgerTailText: string;
  capturedAt: string;
}

let latest: CribbageActiveHandSnapshotPublished | null = null;

/** Called from CribbageMobileCardsTab render/effect. Instrumentation only. */
export function publishCribbageActiveHandSnapshot(
  snapshot: CribbageActiveHandSnapshotPublished,
): void {
  latest = snapshot;
}

/** Called on CribbageMobileCardsTab unmount to signal Cribbage surface is gone. */
export function clearCribbageActiveHandSnapshot(): void {
  latest = null;
}

/** Read latest snapshot (returns null when Cribbage surface not mounted). */
export function peekCribbageActiveHandSnapshot():
  | CribbageActiveHandSnapshotPublished
  | null {
  return latest;
}

/**
 * Capture at the exact submit moment: latest published snapshot plus
 * live DOM child count on `[data-crib-active-hand-stage]`, the derived
 * `authoritativeCardsButEmptyDom` flag (diagnostic only), and the tail
 * of the existing bounded visibility ledger (last 300 entries).
 *
 * Returns null iff Cribbage surface is not currently mounted, which
 * is the mounted-game discriminator.
 */
export function captureCribbageActiveHandSnapshot():
  | CribbageActiveHandCapturedSnapshot
  | null {
  if (!latest) return null;

  let domWrapperCount = 0;
  let domCardCount = 0;
  try {
    if (typeof document !== 'undefined') {
      const stage = document.querySelector(
        '[data-crib-active-hand-stage]',
      ) as HTMLElement | null;
      domWrapperCount = stage?.children.length ?? 0;
      domCardCount = document.querySelectorAll(
        '[data-crib-active-hand-stage] [data-cribbage-hand-card-key]',
      ).length;
    }
  } catch {
    domWrapperCount = 0;
    domCardCount = 0;
  }

  const authoritativeCardsButEmptyDom =
    latest.authoritativeHandCount > 0 && domCardCount === 0;

  // Ledger tail — last 300 entries of the existing bounded ring.
  let ledgerTailText = '';
  try {
    const full = exportCribbageActiveHandText();
    const lines = full.split('\n');
    const headerEnd = lines.findIndex((l) => l === '# ---');
    if (headerEnd >= 0) {
      const header = lines.slice(0, headerEnd + 1);
      const entries = lines.slice(headerEnd + 1);
      const tail = entries.slice(Math.max(0, entries.length - 300));
      ledgerTailText = [...header, ...tail].join('\n');
    } else {
      ledgerTailText = full;
    }
  } catch {
    ledgerTailText = '';
  }

  return {
    ...latest,
    activeHandDomWrapperCount: domWrapperCount,
    activeHandDomCardCount: domCardCount,
    authoritativeCardsButEmptyDom,
    ledgerTailText,
    capturedAt: new Date().toISOString(),
  };
}
