/**
 * CanonicalAnnouncementLayer — renders the active LIFECYCLE announcement
 * inline within the shell's 36px announcement rail.
 *
 * Scope ownership:
 *   - Lifecycle / waiting / contextual messaging only.
 *   - Celebration-tier events (see CELEBRATION_TYPES in ./types) are
 *     intentionally skipped here and rendered by the shell-owned
 *     CanonicalCelebrationLayer overlay instead.
 *
 * Actor visibility gate:
 *   - For `cta_prompt`, when `payload.actorUserId` is present we
 *     require it to match the provider-threaded `viewerUserId`.
 *
 * Telemetry:
 *   - Persistent rail telemetry (see railTelemetry.ts) records every
 *     active receive + every suppression with a reason, so a single
 *     repro is enough to attribute lifecycle gaps to either emitter,
 *     scope rejection, immediate dismissal, or render-time suppression.
 */

import { useEffect, useRef } from 'react';
import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType } from './types';
import { persistRailTelemetry } from './railTelemetry';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  const lastObservedIdRef = useRef<string | null>(null);
  const activeId = ctx?.active?.id ?? null;
  const activeType = ctx?.active?.type ?? null;

  // Emit telemetry once per active-id transition. Mounting and id
  // changes both trigger; renderer suppress reasons are emitted from
  // the render path below so we know whether a "received" event also
  // produced a visible plate.
  useEffect(() => {
    if (lastObservedIdRef.current === activeId) return;
    lastObservedIdRef.current = activeId;
    if (!ctx || !ctx.active) return;
    persistRailTelemetry({
      eventName: 'rail-render-active',
      announcementId: ctx.active.id,
      announcementType: ctx.active.type,
      providerScope: { dealerGameId: null, roundId: null }, // provider passes scope on emit; rail doesn't re-derive
      viewerUserId: ctx.viewerUserId,
      actorUserId:
        (ctx.active.payload as { actorUserId?: string } | undefined)?.actorUserId ?? null,
      extra: {
        ambient: ctx.ambient?.id === ctx.active.id,
        transient: ctx.transient?.id === ctx.active.id,
      },
    });
  }, [activeId, activeType, ctx]);

  if (!ctx || !ctx.active) return null;

  if (isCelebrationType(ctx.active.type)) {
    persistRailTelemetry({
      eventName: 'rail-render-suppressed',
      announcementId: ctx.active.id,
      announcementType: ctx.active.type,
      reason: 'celebration-tier-routed-to-overlay',
      viewerUserId: ctx.viewerUserId,
    });
    return null;
  }

  if (ctx.active.type === 'cta_prompt') {
    const actorUserId = (ctx.active.payload as { actorUserId?: string } | undefined)?.actorUserId;
    if (actorUserId && actorUserId !== ctx.viewerUserId) {
      persistRailTelemetry({
        eventName: 'rail-render-suppressed',
        announcementId: ctx.active.id,
        announcementType: ctx.active.type,
        reason: 'cta-actor-viewer-mismatch',
        viewerUserId: ctx.viewerUserId,
        actorUserId,
      });
      return null;
    }
  }

  const node = renderAnnouncement(ctx.active);
  if (!node) {
    persistRailTelemetry({
      eventName: 'rail-render-suppressed',
      announcementId: ctx.active.id,
      announcementType: ctx.active.type,
      reason: 'renderer-returned-null',
      viewerUserId: ctx.viewerUserId,
    });
    return null;
  }
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
