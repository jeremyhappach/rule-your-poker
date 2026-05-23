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
      style={{
        height: 36,
        minHeight: 36,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        background: 'transparent',
        overflow: 'hidden',
        paddingInline: 12,
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
