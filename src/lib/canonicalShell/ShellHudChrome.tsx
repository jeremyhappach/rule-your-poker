/**
 * ShellHudChrome — shell-owned HUD chrome composition.
 *
 * Architectural finish line for the canonical announcement rail
 * (Phase 5 retirement):
 *
 *   - The 36px announcement rail is OWNED BY THE SHELL. It renders
 *     only the canonical announcement rail driven by the announcement
 *     provider. There is NO `announcementFallback` slot anymore — game
 *     surfaces must emit semantically into the canonical rail via
 *     `useAnnouncements().emit(...)`.
 *
 *   - Non-announcement operational HUD chrome (per-actor turn chips,
 *     timer bars, paused badges, etc.) lives in a sibling region
 *     between the rail and the tab bar at each callsite. Use
 *     `<ShellAnnouncementRail />` + your chrome + `<ShellTabBar />`
 *     when a surface needs that. Surfaces with no chrome can keep
 *     using `<ShellHudChrome />`.
 */

import { useEffect } from 'react';
import { CanonicalAnnouncementLayer } from './announcements';
import { useAnnouncementContext } from './announcements/CanonicalAnnouncementProvider';
import { isCelebrationType, isCtaAmbientType } from './announcements/types';
import { ShellTabBar } from './ShellTabBar';

const traceRailRuntime = (event: string, payload: Record<string, unknown> = {}) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get('trace_gin_announcements') === '1' ||
      window.localStorage.getItem('ptp_trace_gin_announcements') === '1';
    if (!enabled) return;
    console.log('[RAIL_RUNTIME_TRACE]', event, {
      t: Math.round(performance.now()),
      ...payload,
    });
  } catch {
    // no-op: diagnostic only
  }
};

export function ShellAnnouncementRail() {
  const ctx = useAnnouncementContext();
  const active = ctx?.active;
  const hasCanonicalRailEvent =
    !!active &&
    (active.type === 'match_win' || !isCelebrationType(active.type)) &&
    !isCtaAmbientType(active.type);

  useEffect(() => {
    traceRailRuntime('gate:evaluated', {
      activeId: active?.id ?? null,
      activeType: active?.type ?? null,
      hasCanonicalRailEvent,
    });
    if (!hasCanonicalRailEvent || !active) return;
    requestAnimationFrame(() => {
      traceRailRuntime('paint-frame', {
        activeId: active.id,
        activeType: active.type,
      });
    });
  }, [active?.id, active?.type, hasCanonicalRailEvent]);

  return (
    <div
      data-canonical-shell-announcement-rail=""
      className="[&_*]:!rounded-none [&_*]:!border-0 [&_*]:!shadow-none"
      style={{
        // Phase 2: height is shell-token-driven, not a 36px hardcode.
        // Token = --shell-hud-h × --hud-r-announcement. Row clips overflow.
        height: 'var(--hud-h-announcement)',
        minHeight: 'var(--hud-h-announcement)',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        // Rail owns the gold surface so the inner plate can sit flush
        // edge-to-edge without exposing dark felt strips from its own
        // rounded corners or border.
        background: hasCanonicalRailEvent ? 'hsl(var(--poker-gold))' : 'transparent',
        // Border treatment: none. The gold fill alone delimits the rail
        // edge-to-edge; mixed top/bottom borders read as accidental.
        border: 'none',
        overflow: 'hidden',
      }}
    >
      {hasCanonicalRailEvent ? <CanonicalAnnouncementLayer /> : null}
    </div>
  );

}

export function ShellHudChrome() {
  return (
    <>
      <ShellAnnouncementRail />
      <ShellTabBar />
    </>
  );
}
