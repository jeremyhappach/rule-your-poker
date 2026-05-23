/**
 * CanonicalAnnouncementLayer — renders the active LIFECYCLE announcement
 * inline within the shell's 36px announcement rail.
 *
 * Telemetry is emitted strictly from effects — never during render —
 * to prevent insert-storm cascades that previously starved the Supabase
 * client and stalled gameplay writes (e.g. dealer-selection).
 */

import { useEffect, useRef } from 'react';
import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType } from './types';
import { persistRailTelemetry } from './railTelemetry';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  const active = ctx?.active ?? null;

  let suppressReason: string | null = null;
  let node: ReturnType<typeof renderAnnouncement> | null = null;

  if (active) {
    if (isCelebrationType(active.type)) {
      suppressReason = 'celebration-tier-routed-to-overlay';
    } else if (active.type === 'cta_prompt') {
      const actorUserId = (active.payload as { actorUserId?: string } | undefined)?.actorUserId;
      if (actorUserId && actorUserId !== ctx?.viewerUserId) {
        suppressReason = 'cta-actor-viewer-mismatch';
      }
    }
    if (!suppressReason) {
      node = renderAnnouncement(active);
      if (!node) suppressReason = 'renderer-returned-null';
    }
  }

  const lastLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      lastLoggedRef.current = null;
      return;
    }
    const sig = `${active.id}::${suppressReason ?? 'active'}`;
    if (lastLoggedRef.current === sig) return;
    lastLoggedRef.current = sig;
    const actorUserId =
      (active.payload as { actorUserId?: string } | undefined)?.actorUserId ?? null;
    persistRailTelemetry({
      eventName: suppressReason ? 'rail-render-suppressed' : 'rail-render-active',
      announcementId: active.id,
      announcementType: active.type,
      reason: suppressReason ?? undefined,
      viewerUserId: ctx?.viewerUserId ?? null,
      actorUserId,
    });
  }, [active, suppressReason, ctx?.viewerUserId]);

  if (!active || suppressReason || !node) return null;

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
