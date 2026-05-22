/**
 * CanonicalCelebrationLayer — shell-owned celebration overlay.
 *
 * Architectural intent:
 *   - The lifecycle announcement rail (CanonicalAnnouncementLayer) is
 *     reserved for low-fidelity contextual messaging — "Awaiting ante
 *     decisions…", "Next round starting…", etc.
 *   - Celebration-tier events (match_win today; future round-tier
 *     promotions) deserve a distinct centered overlay surface and
 *     must never be downgraded into the 36px lifecycle rail.
 *
 * Ownership:
 *   - Mounted exactly once by PersistentTableShell, above the shell
 *     column, below modal/dialog z-indices.
 *   - Subscribes to the same CanonicalAnnouncementProvider context as
 *     the rail. No new event types, no game-specific emitters, no
 *     bespoke per-game overlays.
 *   - Renders when `active.type` is in CELEBRATION_TYPES; otherwise
 *     returns null.
 *   - Pointer-events disabled so it never blocks gameplay interaction
 *     (chip animations, win-sequence chip transport, etc. run beneath).
 *
 * Observer parity:
 *   - Render is driven purely by the canonical announcement context.
 *     Observers, losers, and winners all see the celebration surface.
 *     Winner-only confetti remains the per-game caller's responsibility
 *     (e.g. Cribbage's triggerWinSequence) and is intentionally NOT
 *     duplicated here.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderCelebration } from './celebrationRenderers';
import { isCelebrationType } from './types';

export function CanonicalCelebrationLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx || !ctx.active) return null;
  if (!isCelebrationType(ctx.active.type)) return null;
  const node = renderCelebration(ctx.active);
  if (!node) return null;

  return (
    <div
      data-canonical-shell-celebration-layer=""
      aria-hidden={false}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 90, // above shell overlay root (80), below modal/toast layers.
      }}
    >
      {node}
    </div>
  );
}
