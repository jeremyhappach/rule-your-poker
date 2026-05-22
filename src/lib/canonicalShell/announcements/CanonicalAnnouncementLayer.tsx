/**
 * CanonicalAnnouncementLayer — renders the active announcement inline.
 *
 * Shell ownership model (single canonical render path):
 *   - PersistentTableShell renders this component inside its own
 *     shell-owned announcement rail container (fixed dimensions,
 *     fixed placement between the shell-owned header and the opaque
 *     game children).
 *   - There is no portal, no slot pattern, no fallback render
 *     location. Games never anchor or position announcements.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx || !ctx.active) return null;
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
