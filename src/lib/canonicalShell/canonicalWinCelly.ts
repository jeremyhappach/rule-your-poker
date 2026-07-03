/**
 * Canonical win-celebration helper.
 *
 * Shared destination bounce + confetti applied at winner-arrival for
 * games that still use the legacy PotToPlayerAnimation transport
 * (3-5-7, Horses, Ship Captain Crew).
 *
 * ARTIFACT-BOUNCE CONTRACT (canonical):
 *
 *   The transfer artifact IS the bounce target. There is one lifecycle:
 *
 *     mount → flight → arrival freeze at winner rect → bounce → teardown
 *
 *   Beat 1 (`startCanonicalWinSequence`):
 *     - Fires winner-only confetti (localViewerId === winnerPlayerId).
 *     - Does NOT resolve any seat-cluster anchor. The bounce target is
 *       the transfer artifact itself, which will be mounted by
 *       PotToPlayerAnimation on the same beat.
 *
 *   Beat 2 (`completeCanonicalWinSequence`):
 *     - Resolves the transfer artifact by `transferArtifactId` (the
 *       PotToPlayerAnimation triggerId) via
 *       `[data-win-transfer-artifact="{id}"]` / its inner descendant.
 *     - Applies the shared `__chipDestBounce` keyframe to THAT node.
 *     - If the artifact is unexpectedly gone, records
 *       WIN_TRANSFER_ARTIFACT_MISSING_AT_ARRIVAL. NO seat-cluster /
 *       chip-disc / screen-center fallback exists.
 */

import confetti from 'canvas-confetti';

const STYLE_ID = '__chip-dest-reaction-keyframes';
const BOUNCE_DURATION_MS = 900;

function ensureBounceStylesheet(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes __chipDestBounce {
      0%   { transform: translateY(0)    scale(1); }
      18%  { transform: translateY(-14px) scale(1.22); }
      34%  { transform: translateY(0)    scale(1.00); }
      48%  { transform: translateY(-9px) scale(1.14); }
      62%  { transform: translateY(0)    scale(0.96); }
      78%  { transform: translateY(-3px) scale(1.04); }
      100% { transform: translateY(0)    scale(1); }
    }
  `;
  document.head.appendChild(style);
}

function applyBounce(el: HTMLElement): void {
  ensureBounceStylesheet();
  const prevAnim = el.style.animation;
  const prevOrigin = el.style.transformOrigin;
  el.style.transformOrigin = '50% 50%';
  // `!important` so we override any inline animation the transfer keyframe
  // may still hold (PotToPlayerAnimation forwards the destination frame,
  // but its animation shorthand can otherwise win the cascade).
  el.style.setProperty(
    'animation',
    `__chipDestBounce ${BOUNCE_DURATION_MS}ms cubic-bezier(.34,1.56,.64,1)`,
    'important',
  );
  window.setTimeout(() => {
    if (el.style.animation.includes('__chipDestBounce')) {
      el.style.animation = prevAnim;
      el.style.transformOrigin = prevOrigin;
    }
  }, BOUNCE_DURATION_MS + 50);
}

function fireConfetti(): void {
  try {
    const palette = ['#fbbf24', '#f59e0b', '#fcd34d', '#fde68a', '#ffffff'];
    confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 }, colors: palette });
    window.setTimeout(
      () => confetti({ particleCount: 80, spread: 60, origin: { x: 0.3, y: 0.55 }, colors: palette }),
      250,
    );
    window.setTimeout(
      () => confetti({ particleCount: 80, spread: 60, origin: { x: 0.7, y: 0.55 }, colors: palette }),
      500,
    );
  } catch {
    /* confetti is best-effort; never break the win sequence. */
  }
}

import {
  recordWinPresentationEvent,
  recordWinPresentationViolation,
  type WinAttemptIdentity,
} from './winPresentationLedger';

export interface CanonicalWinCellyArgs {
  /** Table container (kept for API compatibility; no longer used for lookup). */
  container: HTMLElement | null;
  /** Winner seat position (kept for diagnostics; not used to resolve bounce target). */
  winnerPosition: number;
  /**
   * Stable idempotency key. Callers should combine gameId + winnerId
   * (+ handContextId when appropriate) so remounts / re-hydration /
   * re-emitted outcomes cannot double-fire.
   */
  winKey: string;
  /**
   * PotToPlayerAnimation triggerId — used to resolve the transfer
   * artifact for the destination bounce. Required at complete-beat.
   */
  transferArtifactId?: string | null;
  ledgerIdentity?: WinAttemptIdentity;
  ledgerOwner?: string;
  ledgerSource?: string;
}

/** @deprecated compat shim; no callers remain. */
export function fireCanonicalWinCelly(args: CanonicalWinCellyArgs): void {
  startCanonicalWinSequence(args);
  completeCanonicalWinSequence(args);
}

// -----------------------------------------------------------------------
// Split canonical sequence (transfer-start beat + transfer-end beat).
// -----------------------------------------------------------------------

const startedKeys = new Set<string>();
const completedKeys = new Set<string>();

function resolveEligibility(id: WinAttemptIdentity | undefined):
  'winner' | 'nonwinner' | 'unknown'
{
  const viewerId = id?.localViewerId ?? null;
  const winnerId = id?.winnerPlayerId ?? null;
  if (!viewerId || !winnerId) return 'unknown';
  return viewerId === winnerId ? 'winner' : 'nonwinner';
}

/**
 * Resolve the transfer artifact (inner element with the transport
 * animation) for the given PotToPlayerAnimation triggerId. Falls back
 * to the outer wrapper if the inner marker is not found, but NEVER to
 * any seat-cluster / chip-disc element.
 */
function resolveTransferArtifact(
  transferArtifactId: string | null | undefined,
): { outer: HTMLElement; inner: HTMLElement } | null {
  if (typeof document === 'undefined') return null;
  if (!transferArtifactId) {
    // No triggerId supplied — try any live artifact as last resort.
    const anyOuter = document.querySelector(
      '[data-win-transfer-artifact]',
    ) as HTMLElement | null;
    if (!anyOuter) return null;
    const anyInner = (anyOuter.querySelector(
      '[data-win-transfer-artifact-inner]',
    ) as HTMLElement | null) ?? anyOuter;
    return { outer: anyOuter, inner: anyInner };
  }
  const escape = (v: string) =>
    (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
  const outer = document.querySelector(
    `[data-win-transfer-artifact="${escape(transferArtifactId)}"]`,
  ) as HTMLElement | null;
  if (!outer) return null;
  const inner = (outer.querySelector(
    `[data-win-transfer-artifact-inner="${escape(transferArtifactId)}"]`,
  ) as HTMLElement | null)
    ?? (outer.querySelector('[data-win-transfer-artifact-inner]') as HTMLElement | null)
    ?? outer;
  return { outer, inner };
}

export function startCanonicalWinSequence({
  winnerPosition,
  winKey,
  transferArtifactId,
  ledgerIdentity,
  ledgerOwner,
  ledgerSource,
}: CanonicalWinCellyArgs): void {
  const source = ledgerSource ?? 'canonicalWinCelly.startCanonicalWinSequence';
  const id = ledgerIdentity;

  if (!winKey) {
    if (id) recordWinPresentationViolation(id, 'WIN_DUPLICATE_OR_REPLAYED_SEQUENCE', source, { reason: 'empty-winKey' });
    return;
  }
  if (startedKeys.has(winKey)) {
    if (id) recordWinPresentationEvent({
      identity: id, name: 'duplicate-outcome-suppressed', source, owner: ledgerOwner,
      severity: 'warn', payload: { winKey, beat: 'start' },
    });
    return;
  }
  startedKeys.add(winKey);

  const eligibility = resolveEligibility(id);

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'canonical-sequence-requested', source, owner: ledgerOwner,
      payload: { winKey, winnerPosition, eligibility, beat: 'start', transferArtifactId: transferArtifactId ?? null },
    });
    recordWinPresentationEvent({
      identity: id, name: 'canonical-sequence-accepted', source, owner: ledgerOwner,
      payload: { beat: 'start' },
    });
  }

  // WINNER-ONLY confetti. Losers/observers get transfer + bounce only.
  if (eligibility !== 'winner') {
    if (id) recordWinPresentationEvent({
      identity: id, name: 'confetti-trigger-requested', source, owner: ledgerOwner,
      payload: { eligibility, suppressed: true, reason: 'non-winner-client' },
    });
    window.setTimeout(() => startedKeys.delete(winKey), 30000);
    return;
  }

  if (id) recordWinPresentationEvent({
    identity: id, name: 'confetti-trigger-requested', source, owner: ledgerOwner,
    payload: { eligibility },
  });

  fireConfetti();

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'confetti-mounted', source, owner: ledgerOwner,
      payload: { eligibility, targetAudience: 'winner', branch: 'startCanonicalWinSequence' },
    });
    window.setTimeout(() => {
      recordWinPresentationEvent({ identity: id, name: 'confetti-complete', source, owner: ledgerOwner });
    }, 900);
  }

  window.setTimeout(() => startedKeys.delete(winKey), 30000);
}

/**
 * Beat 2 — apply destination bounce to the transferred pot artifact
 * itself, at its resolved winner-destination position. Runs on every
 * client. Idempotent per `winKey`. No seat-cluster fallback.
 */
/**
 * Beat 2 — ledger-only observer.
 *
 * The canonical FLYING → ARRIVAL_HOLD → BOUNCING → COMPLETE phase
 * machine now lives inside PotToPlayerAnimation, which owns the
 * bounce on the same transfer-artifact DOM node it flew in. This
 * helper therefore no longer touches the DOM and never applies a
 * bounce here — doing so would either double-bounce or fire after
 * the artifact has already unmounted at COMPLETE.
 *
 * Consumers still call this on transfer-complete so the presentation
 * ledger records canonical-sequence teardown / duplicate-suppression
 * against the shared winKey.
 */
export function completeCanonicalWinSequence({
  winnerPosition,
  winKey,
  transferArtifactId,
  ledgerIdentity,
  ledgerOwner,
  ledgerSource,
}: CanonicalWinCellyArgs): void {
  const source = ledgerSource ?? 'canonicalWinCelly.completeCanonicalWinSequence';
  const id = ledgerIdentity;

  if (!winKey) {
    if (id) recordWinPresentationViolation(id, 'WIN_DUPLICATE_OR_REPLAYED_SEQUENCE', source, { reason: 'empty-winKey' });
    return;
  }
  if (completedKeys.has(winKey)) {
    if (id) recordWinPresentationEvent({
      identity: id, name: 'duplicate-outcome-suppressed', source, owner: ledgerOwner,
      severity: 'warn', payload: { winKey, beat: 'complete' },
    });
    return;
  }
  completedKeys.add(winKey);

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'destination-arrival', source, owner: ledgerOwner,
      payload: {
        winnerPosition,
        transferArtifactId: transferArtifactId ?? null,
        bounceOwner: 'PotToPlayerAnimation.phaseMachine',
      },
    });
    recordWinPresentationEvent({
      identity: id, name: 'canonical-sequence-accepted', source, owner: ledgerOwner,
      payload: { beat: 'complete', note: 'bounce-owned-by-artifact' },
    });
  }

  window.setTimeout(() => completedKeys.delete(winKey), 30000);
}
