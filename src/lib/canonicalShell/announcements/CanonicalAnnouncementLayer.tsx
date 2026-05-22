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
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType } from './types';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx || !ctx.active) return null;
  // Celebration-tier events render in the dedicated celebration overlay.
  if (isCelebrationType(ctx.active.type)) return null;
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
