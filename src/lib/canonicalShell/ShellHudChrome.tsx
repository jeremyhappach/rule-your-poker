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
  const ambient = ctx?.ambient;
  const hasCanonicalRailEvent =
    !!active &&
    (active.type === 'match_win' || !isCelebrationType(active.type)) &&
    !isCtaAmbientType(active.type);
  const railActive =
    active?.type === 'match_win'
      ? active
      : ambient?.type === 'dealer_configuring'
        ? ambient
        : active;
  const canonicalLayerMounted = hasCanonicalRailEvent;

  const showAnnouncementDebug = true;
  const debugText = [
    'ANNOUNCEMENT RUNTIME PROOF',
    `active.type: ${active?.type ?? 'null'}`,
    `ambient.type: ${ambient?.type ?? 'null'}`,
    `railActive.type: ${railActive?.type ?? 'null'}`,
    `hasCanonicalRailEvent: ${String(hasCanonicalRailEvent)}`,
    `CanonicalAnnouncementLayer mounted: ${String(canonicalLayerMounted)}`,
  ].join('\n');

  useEffect(() => {
    traceRailRuntime('gate:evaluated', {
      activeId: active?.id ?? null,
      activeType: active?.type ?? null,
      ambientId: ambient?.id ?? null,
      ambientType: ambient?.type ?? null,
      hasCanonicalRailEvent,
    });
    if (!hasCanonicalRailEvent || !active) return;
    requestAnimationFrame(() => {
      traceRailRuntime('paint-frame', {
        activeId: active.id,
        activeType: active.type,
      });
    });
  }, [active?.id, active?.type, ambient?.id, ambient?.type, hasCanonicalRailEvent]);

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
        position: 'relative',
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
      {showAnnouncementDebug ? (
        <>
          <div
            data-announcement-runtime-debug-rail=""
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2147483646,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              background: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: 1,
              textAlign: 'center',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {`ANN PROOF active=${active?.type ?? 'null'} ambient=${ambient?.type ?? 'null'} rail=${railActive?.type ?? 'null'} event=${String(hasCanonicalRailEvent)} layer=${String(canonicalLayerMounted)}`}
          </div>
          <div
            data-announcement-runtime-debug=""
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: 0,
              zIndex: 2147483647,
              padding: '10px 12px',
              background: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              borderBottom: '4px solid hsl(var(--poker-gold))',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.25,
              textAlign: 'left',
              pointerEvents: 'none',
              whiteSpace: 'pre-wrap',
            }}
          >
            {debugText}
          </div>
        </>
      ) : null}
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
