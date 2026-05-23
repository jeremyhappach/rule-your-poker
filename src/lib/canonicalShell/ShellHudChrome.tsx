import type { ReactNode } from 'react';
import { CanonicalAnnouncementLayer } from './announcements';
import { useAnnouncementContext } from './announcements/CanonicalAnnouncementProvider';
import { isCelebrationType, isCtaAmbientType } from './announcements/types';
import { ShellTabBar } from './ShellTabBar';

interface ShellHudChromeProps {
  /** Legacy/local gameplay announcement plate shown only when the canonical rail is idle. */
  announcementFallback?: ReactNode;
}

export function ShellAnnouncementRail({ announcementFallback }: ShellHudChromeProps) {
  const ctx = useAnnouncementContext();
  const active = ctx?.active;
  const hasCanonicalRailEvent =
    !!active && !isCelebrationType(active.type) && !isCtaAmbientType(active.type);

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
      {hasCanonicalRailEvent ? <CanonicalAnnouncementLayer /> : announcementFallback}
    </div>
  );
}

export function ShellHudChrome({ announcementFallback }: ShellHudChromeProps) {
  return (
    <>
      <ShellAnnouncementRail announcementFallback={announcementFallback} />
      <ShellTabBar />
    </>
  );
}