/**
 * CanonicalAnnouncementLayer — renders the active LIFECYCLE announcement
 * inline within the shell's 36px announcement rail.
 *
 * Scope ownership:
 *   - Lifecycle / waiting / contextual messaging only.
 *   - Celebration-tier events (see CELEBRATION_TYPES in ./types) are
 *     intentionally skipped here and rendered by the shell-owned
 *     CanonicalCelebrationLayer overlay instead. A celebration event
 *     must never land in the lifecycle rail.
 *
 * Actor visibility gate:
 *   - For `cta_prompt`, when `payload.actorUserId` is present we
 *     require it to match the provider-threaded `viewerUserId`.
 *     Mismatched viewers see nothing for this slot (the matching
 *     `waiting_for_player` ambient, if any, is the observer-side
 *     surface and is emitted separately by the game). Defense in
 *     depth: emitters are also expected to only fire on the actor's
 *     own client.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType } from './types';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx || !ctx.active) return null;
  // Celebration-tier events render in the dedicated celebration overlay.
  if (isCelebrationType(ctx.active.type)) return null;

  // Actor-only visibility gate for cta_prompt.
  if (ctx.active.type === 'cta_prompt') {
    const actorUserId = (ctx.active.payload as { actorUserId?: string } | undefined)?.actorUserId;
    if (actorUserId && actorUserId !== ctx.viewerUserId) {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[canonical-rail] cta_prompt suppressed for non-actor viewer',
          { actorUserId, viewerUserId: ctx.viewerUserId, id: ctx.active.id },
        );
      }
      return null;
    }
  }

  const node = renderAnnouncement(ctx.active);
  if (!node) return null;
  return (
    <div
      data-canonical-announcement-content=""
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {node}
    </div>
  );
}
