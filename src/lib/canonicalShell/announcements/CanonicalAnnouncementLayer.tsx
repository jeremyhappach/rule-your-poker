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

import { useEffect } from 'react';
import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType, isCtaAmbientType } from './types';
import { recordAnnouncementDebugEvent } from './announcementDebugLog';
import { useLifecycleMount, getLifecycleContext } from '../lifecycleDebug';
import { useUnmountSnapshot } from '../shellLifecycleLog';
import { useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';

const traceAnnouncementPaint = (event: string, payload: Record<string, unknown> = {}) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get('trace_gin_announcements') === '1' ||
      window.localStorage.getItem('ptp_trace_gin_announcements') === '1';
    if (!enabled) return;
    console.log('[ANN_PAINT_TRACE]', event, {
      t: Math.round(performance.now()),
      ...payload,
    });
  } catch {
    // no-op: diagnostic only
  }
};

export function CanonicalAnnouncementLayer() {
  useLifecycleMount('CanonicalAnnouncementLayer');
  const _ctx = getLifecycleContext();
  useStartupMountTrace('CanonicalAnnouncementLayer', { gameType: _ctx.gameType, gameStatus: _ctx.gameStatus });
  useStartupRenderTrace('CanonicalAnnouncementLayer', {
    gameType: _ctx.gameType,
    gameStatus: _ctx.gameStatus,
    dealerGameId: _ctx.dealerGameId,
    roundId: _ctx.roundId,
    shellRoute: _ctx.shellRoute,
  }, { file: 'src/lib/canonicalShell/announcements/CanonicalAnnouncementLayer.tsx' });
  useUnmountSnapshot('CanonicalAnnouncementLayer', {
    parent: 'ShellAnnouncementRail → ShellHudGrid row 1 → gameplay-surface',
    gameType: _ctx.gameType,
    gameStatus: _ctx.gameStatus,
    dealerGameId: _ctx.dealerGameId,
    roundId: _ctx.roundId,
    shellRoute: _ctx.shellRoute,
  });
  // Layer mount/unmount instrumentation (always while component is alive).
  useEffect(() => {
    recordAnnouncementDebugEvent('layer-mount', 'CanonicalAnnouncementLayer');
    return () => recordAnnouncementDebugEvent('layer-unmount', 'CanonicalAnnouncementLayer');
  }, []);

  const ctx = useAnnouncementContext();
  if (!ctx) return null;

  // ── Global between-games lifecycle precedence ──────────────────
  // See CanonicalAnnouncementProvider for the longer ownership note.
  // Ownership inversion: while a terminal match_win is active, it
  // outranks the dealer_configuring ambient so the winner plate gets
  // its paint window. Once match_win leaves the active slot,
  // dealer_configuring resumes between-games precedence.
  // SESSION ENDED outranks everything: it is the terminal-most phase
  // plate and must not be displaced by leftover gameplay announcements.
  // Solo Holm showdown is a table-contextual ambient: it renders only while
  // no transient result is active, so the result plate can take priority.
  const railActive =
    ctx.ambient?.type === 'session_ended'
      ? ctx.ambient
      : ctx.active?.type === 'match_win'
      ? ctx.active
      : ctx.ambient?.type === 'dealer_configuring'
        ? ctx.ambient
        : ctx.active ?? (ctx.ambient?.type === 'solo_showdown' ? ctx.ambient : null);
  if (!railActive) return null;

  // Celebration-tier events ALSO render a centered overlay via
  // CanonicalCelebrationLayer, but match_win additionally renders a
  // winner plate in the lifecycle rail so observers and players get a
  // clear "who won" announcement. Other celebration types skip the rail.
  if (isCelebrationType(railActive.type) && railActive.type !== 'match_win') {
    traceAnnouncementPaint('rail:filtered:celebration', { id: railActive.id, type: railActive.type });
    return null;
  }
  // Actor-directed CTAs / waiting-on-player prompts render in the
  // ambient helper text area inside the active content pane — not in
  // the shell announcement rail.
  if (isCtaAmbientType(railActive.type)) {
    traceAnnouncementPaint('rail:filtered:cta-ambient', { id: railActive.id, type: railActive.type });
    return null;
  }

  // Actor-only visibility gate for cta_prompt.
  if (railActive.type === 'cta_prompt') {
    const actorUserId = (railActive.payload as { actorUserId?: string } | undefined)?.actorUserId;
    if (actorUserId && actorUserId !== ctx.viewerUserId) {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[canonical-rail] cta_prompt suppressed for non-actor viewer',
          { actorUserId, viewerUserId: ctx.viewerUserId, id: railActive.id },
        );
      }
      return null;
    }
  }

  const node = renderAnnouncement(railActive);
  if (!node) return null;
  traceAnnouncementPaint('rail:render', { id: railActive.id, type: railActive.type });
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
