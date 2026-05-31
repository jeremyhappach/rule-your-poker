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

import { CanonicalAnnouncementLayer } from './announcements';
import { useAnnouncementContext } from './announcements/CanonicalAnnouncementProvider';
import { isCelebrationType, isCtaAmbientType } from './announcements/types';
import { ShellTabBar } from './ShellTabBar';

export function ShellAnnouncementRail() {
  const ctx = useAnnouncementContext();
  const active = ctx?.active;
  const hasCanonicalRailEvent =
    !!active &&
    (active.type === 'match_win' || !isCelebrationType(active.type)) &&
    !isCtaAmbientType(active.type);

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
        borderTop: hasCanonicalRailEvent ? '1px solid hsl(30 70% 20%)' : 'none',
        borderBottom: hasCanonicalRailEvent ? '1px solid hsl(30 70% 20%)' : 'none',
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
