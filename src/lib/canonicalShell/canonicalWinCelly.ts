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
}: CanonicalWinCellyArgs): void {
  if (!winKey) return;
  if (firedKeys.has(winKey)) return;
  firedKeys.add(winKey);

  const scope: ParentNode = container ?? (typeof document !== 'undefined' ? document : null as unknown as ParentNode);
  const el = scope
    ? ((scope.querySelector(`[data-chip-reaction-target="${winnerPosition}"]`) as HTMLElement | null)
        ?? (scope.querySelector(`[data-chip-center="${winnerPosition}"]`) as HTMLElement | null))
    : null;
  if (el) applyBounce(el);

  fireConfetti();

  // Release the dedupe latch after a generous window so the same seat
  // can celebrate again in a later match without a page reload.
  window.setTimeout(() => firedKeys.delete(winKey), 30000);
}
