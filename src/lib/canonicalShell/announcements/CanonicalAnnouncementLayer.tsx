/**
 * CanonicalAnnouncementLayer — portals the active announcement into the
 * HUD-owned AnnouncementRailSlot. There is no shell/table fallback:
 * if the HUD rail is not mounted, nothing renders. This enforces
 * single-ownership of announcement placement at the HUD layer.
 */

import { createPortal } from 'react-dom';
import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { useAnnouncementRailNode } from './AnnouncementRail';
import { renderAnnouncement } from './renderers';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  const railNode = useAnnouncementRailNode();
  if (!ctx || !ctx.active) return null;
  if (!railNode) return null;
  const node = renderAnnouncement(ctx.active);
  if (!node) return null;
  return createPortal(
    <div
      data-canonical-announcement-content=""
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        padding: '4px 8px',
        pointerEvents: 'none',
      }}
    >
      {node}
    </div>,
    railNode,
  );
}
