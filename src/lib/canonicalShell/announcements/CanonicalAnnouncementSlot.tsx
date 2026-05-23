/**
 * CanonicalAnnouncementSlot — shell chrome primitive for lifecycle
 * messaging, mounted by gameplay surfaces directly above the tab bar.
 *
 * Contract:
 *   - Fixed reserved height (36px). Never collapses.
 *   - Transparent / invisible when idle (no background, no border).
 *   - Single-line, centered messaging via CanonicalAnnouncementLayer.
 *   - Stable geometry — adding/removing announcements does not move the
 *     surrounding HUD or tab bar.
 *   - Pointer-events disabled (interactive CTAs are owned by separate
 *     gameplay strips for now).
 *
 * Placement rule:
 *   Mount this immediately BEFORE the tab navigation `<div>` in each
 *   game surface (CribbageMobileGameTable, MobileGameTable,
 *   GinRummyGameTable, YahtzeeGameTable). It must NOT live at the
 *   bottom of the shell column or inside tab content.
 */
import { CanonicalAnnouncementLayer } from './CanonicalAnnouncementLayer';

export const CANONICAL_ANNOUNCEMENT_SLOT_HEIGHT_PX = 36;

export function CanonicalAnnouncementSlot() {
  return (
    <div
      data-canonical-announcement-slot=""
      style={{
        flex: '0 0 auto',
        height: CANONICAL_ANNOUNCEMENT_SLOT_HEIGHT_PX,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      <CanonicalAnnouncementLayer />
    </div>
  );
}
