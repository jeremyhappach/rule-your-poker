/**
 * Canonical win-celebration helper.
 *
 * Shared destination bounce + confetti applied at winner-arrival for
 * games that still use the legacy PotToPlayerAnimation transport
 * (3-5-7, Horses, Ship Captain Crew). Games on the canonical
 * ChipTransport pipeline (Cribbage, Holm) get bounce via
 * ChipTransportRuntime's destinationReaction and fire their own
 * confetti; this helper is the parity glue for the FROZEN transport
 * consumers.
 *
 * Contract:
 *   - Reuses the same `__chipDestBounce` keyframe id owned by
 *     ChipTransportRuntime so we don't fork the bounce feel. Style tag
 *     id is stable — if the runtime has already mounted the sheet, we
 *     no-op; otherwise we install an identical copy.
 *   - Targets the same `[data-chip-reaction-target="{position}"]`
 *     anchor as the canonical runtime, falling back to
 *     `[data-chip-center="{position}"]`.
 *   - Fires a canvas-confetti burst comparable to Cribbage / Yahtzee.
 *   - Dedupes by caller-supplied winKey so remounts, replays, or
 *     re-emitted outcomes cannot double-fire the celebration.
 *
 * Non-goals:
 *   - Does NOT drive chip motion, teardown, or announcements. Callers
 *     must continue to invoke their existing pot-transfer complete
 *     handlers.
 */

import confetti from 'canvas-confetti';

const STYLE_ID = '__chip-dest-reaction-keyframes';
const BOUNCE_DURATION_MS = 900;

const firedKeys = new Set<string>();

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
  el.style.animation = `__chipDestBounce ${BOUNCE_DURATION_MS}ms cubic-bezier(.34,1.56,.64,1)`;
  window.setTimeout(() => {
    // Only restore if we still own the animation slot.
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
  /** Table container to scope DOM lookup. Falls back to document. */
  container: HTMLElement | null;
  /** Winner seat position (matches data-chip-* attribute value). */
  winnerPosition: number;
  /**
   * Stable idempotency key. Callers should combine gameId + winnerId
   * (+ handContextId when appropriate) so remounts / re-hydration /
   * re-emitted outcomes cannot double-fire.
   */
  winKey: string;
  /**
   * Optional win-attempt identity for the CANONICAL_WIN_PRESENTATION_LEDGER.
   * When supplied, this call is recorded with full source/eligibility
   * attribution and violations are emitted for common misuses.
   */
  ledgerIdentity?: WinAttemptIdentity;
  /** Optional caller tag (e.g. '357', 'horses', 'scc'). */
  ledgerOwner?: string;
  /** Optional caller source label. */
  ledgerSource?: string;
}

/**
 * Fire the canonical win celebration (destination bounce + confetti).
 * Idempotent per `winKey`. Safe to call from onAnimationEnd of legacy
 * pot-transfer animators after the chip has visibly arrived.
 */
export function fireCanonicalWinCelly({
  container,
  winnerPosition,
  winKey,
  ledgerIdentity,
  ledgerOwner,
  ledgerSource,
}: CanonicalWinCellyArgs): void {
  const source = ledgerSource ?? 'canonicalWinCelly.fireCanonicalWinCelly';
  const id = ledgerIdentity;

  if (!winKey) {
    if (id) recordWinPresentationViolation(id, 'WIN_DUPLICATE_OR_REPLAYED_SEQUENCE', source, { reason: 'empty-winKey' });
    return;
  }
  if (firedKeys.has(winKey)) {
    if (id) recordWinPresentationEvent({
      identity: id, name: 'duplicate-outcome-suppressed', source, owner: ledgerOwner,
      severity: 'warn', payload: { winKey },
    });
    return;
  }
  firedKeys.add(winKey);

  const viewerId = id?.localViewerId ?? null;
  const winnerId = id?.winnerPlayerId ?? null;
  const eligibility: 'winner' | 'nonwinner' | 'unknown' =
    viewerId && winnerId ? (viewerId === winnerId ? 'winner' : 'nonwinner') : 'unknown';

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'canonical-sequence-requested', source, owner: ledgerOwner,
      payload: { winKey, winnerPosition, eligibility },
    });
  }

  const scope: ParentNode = container ?? (typeof document !== 'undefined' ? document : null as unknown as ParentNode);
  const el = scope
    ? ((scope.querySelector(`[data-chip-reaction-target="${winnerPosition}"]`) as HTMLElement | null)
        ?? (scope.querySelector(`[data-chip-center="${winnerPosition}"]`) as HTMLElement | null))
    : null;

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'winner-destination-resolved', source, owner: ledgerOwner,
      payload: { found: !!el, winnerPosition },
    });
    if (!el) recordWinPresentationViolation(id, 'WIN_BOUNCE_TARGET_MISSING', source, { winnerPosition });
  }

  if (el) {
    if (id) recordWinPresentationEvent({
      identity: id, name: 'bounce-start', source, owner: ledgerOwner,
      payload: { durationMs: BOUNCE_DURATION_MS },
    });
    applyBounce(el);
    if (id) window.setTimeout(() => {
      recordWinPresentationEvent({ identity: id, name: 'bounce-complete', source, owner: ledgerOwner });
    }, BOUNCE_DURATION_MS + 60);
  }

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'confetti-trigger-requested', source, owner: ledgerOwner,
      payload: { eligibility, viewerId, winnerId },
    });
    if (eligibility === 'nonwinner') {
      recordWinPresentationViolation(id, 'WIN_CONFETTI_ON_NONWINNER_CLIENT', source, {
        viewerId, winnerId, localRole: id.localRole ?? null,
      });
    }
  }

  fireConfetti();

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'confetti-mounted', source, owner: ledgerOwner,
      payload: { eligibility, targetAudience: eligibility, branch: 'fireCanonicalWinCelly' },
    });
    window.setTimeout(() => {
      recordWinPresentationEvent({ identity: id, name: 'confetti-complete', source, owner: ledgerOwner });
    }, 900);
  }

  window.setTimeout(() => firedKeys.delete(winKey), 30000);
}
