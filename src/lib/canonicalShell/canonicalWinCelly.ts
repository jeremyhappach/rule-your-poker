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

// legacy dedupe set retained for backward-compat shim only.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _firedKeys = new Set<string>();


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
 *
 * @deprecated Prefer the split `startCanonicalWinSequence` (fires
 * winner-only confetti at pot-transfer start) and
 * `completeCanonicalWinSequence` (fires destination bounce after the
 * chip has visibly arrived). This monolithic entry point violates the
 * canonical contract by conflating both beats, and is kept only for
 * transient compatibility. No callers remain in-tree.
 */
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
 * Beat 1 of the canonical win sequence — fires winner-only confetti
 * the moment the pot transfer begins. Idempotent per `winKey`.
 *
 * Contract:
 *   - Confetti mounts iff `localViewerId === winnerPlayerId`. Losing
 *     seats, observers, and bot seats never see confetti.
 *   - Records `canonical-sequence-requested`, `canonical-sequence-accepted`,
 *     and (when eligible) `confetti-trigger-requested` +
 *     `confetti-mounted` on the shared ledger identity so replays /
 *     late-mount attempts correlate under the same winAttemptId.
 *   - Resolves and RETAINS the canonical winner-destination anchor at
 *     start (document-scoped, mirroring the endpoints published by
 *     CanonicalSeatCluster and ShellViewerChipEndpoint). The same
 *     retained anchor is used for the arrival bounce, so the transfer
 *     landing target and bounce target are one object — no independent
 *     re-query after transfer completion.
 *   - If no canonical anchor exists at start, records
 *     `WIN_BOUNCE_TARGET_MISSING` and does not proceed with confetti
 *     or bounce for this winKey (canonical boundary hold — no
 *     fabricated screen-center or legacy fallback target).
 */

/**
 * Resolve the canonical winner-destination anchor from the DOM, using
 * the same attributes CanonicalSeatCluster / CanonicalChipDisc /
 * ShellViewerChipEndpoint publish for every seat (including the local
 * viewer's portaled endpoint). Document-scoped on purpose — the local
 * viewer's chip endpoint is portaled onto the shell felt element,
 * which may sit outside a caller-supplied `container` subtree, so
 * container-scoped lookups silently miss the local winner. This is
 * the shared resolver used at both beats.
 */
function resolveWinnerAnchor(winnerPosition: number): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (
    (document.querySelector(
      `[data-chip-reaction-target="${winnerPosition}"]`,
    ) as HTMLElement | null) ??
    (document.querySelector(
      `[data-chip-center="${winnerPosition}"]`,
    ) as HTMLElement | null)
  );
}

/** Anchors retained at start, keyed by winKey. Consumed at complete. */
const retainedAnchors = new Map<string, HTMLElement>();

export function startCanonicalWinSequence({
  winnerPosition,
  winKey,
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
      payload: { winKey, winnerPosition, eligibility, beat: 'start' },
    });
  }

  // Resolve the canonical winner-destination anchor NOW, before any
  // beat proceeds. Retain the exact element so bounce fires on the
  // same DOM node the pot-transfer lands on. If missing, hold the
  // canonical sequence: no confetti, no bounce, violation recorded.
  const anchor = resolveWinnerAnchor(winnerPosition);
  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'winner-destination-resolved', source, owner: ledgerOwner,
      payload: { found: !!anchor, winnerPosition, beat: 'start', retained: !!anchor },
    });
  }
  if (!anchor) {
    if (id) recordWinPresentationViolation(
      id,
      'WIN_BOUNCE_TARGET_MISSING',
      source,
      { winnerPosition, phase: 'start', reason: 'no-canonical-anchor-before-transfer' },
    );
    // Do not admit the sequence; do not fabricate a fallback target.
    startedKeys.delete(winKey);
    return;
  }
  retainedAnchors.set(winKey, anchor);

  if (id) {
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
 * Beat 2 of the canonical win sequence — fires destination bounce on
 * the winner chip anchor after the pot transfer has landed. Idempotent
 * per `winKey`. Runs on every client because the bounce reflects chip
 * arrival, not local eligibility. Reuses the anchor retained at start
 * so this beat and the transfer landing point are one shared object.
 */
export function completeCanonicalWinSequence({
  winnerPosition,
  winKey,
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

  if (id) recordWinPresentationEvent({
    identity: id, name: 'destination-arrival', source, owner: ledgerOwner,
    payload: { winnerPosition },
  });

  // Prefer the anchor retained at start (same object the transfer
  // landed against). If it disconnected mid-lifecycle, re-resolve
  // canonically once — never fall back to legacy container scope or
  // fabricated screen-center targets.
  let el: HTMLElement | null = retainedAnchors.get(winKey) ?? null;
  const retainedStillMounted = !!el && el.isConnected;
  if (!retainedStillMounted) {
    el = resolveWinnerAnchor(winnerPosition);
  }

  if (id) {
    recordWinPresentationEvent({
      identity: id, name: 'winner-destination-resolved', source, owner: ledgerOwner,
      payload: {
        found: !!el,
        winnerPosition,
        beat: 'complete',
        source: retainedStillMounted ? 'retained' : (el ? 're-resolved' : 'missing'),
      },
    });
    if (!el) recordWinPresentationViolation(
      id, 'WIN_BOUNCE_TARGET_MISSING', source,
      { winnerPosition, phase: 'complete', reason: 'anchor-lost-before-arrival' },
    );
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

  retainedAnchors.delete(winKey);
  window.setTimeout(() => completedKeys.delete(winKey), 30000);
}


