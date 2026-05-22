/**
 * CanonicalAnnouncementLayer — single shell-owned render surface for
 * announcements. Reads provider state and renders the active event.
 *
 * Z-order contract:
 *   - Above slot/game content (z-index 70)
 *   - Below shell-owned modal/overlay roots (overlay-root is z-80,
 *     modals are higher). Announcements are visual-only and pointer-
 *     events:none so they never block interaction.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { LifecycleAnnouncement } from '@/components/LifecycleAnnouncement';
import { renderAnnouncement } from './renderers';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx || !ctx.active) return null;
  const node = renderAnnouncement(ctx.active);
  return (
    <div
      data-canonical-announcement-layer=""
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 8,
        zIndex: 70,
        pointerEvents: 'none',
      }}
    >
      {node ?? <LifecycleAnnouncement title={ctx.active.type} />}
    </div>
  );
}
