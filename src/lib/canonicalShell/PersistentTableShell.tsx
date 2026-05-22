/**
 * PersistentTableShell — canonical shell ownership boundary.
 *
 * P8.1 additions (infrastructure only — no behavior change for existing
 * gameplay surfaces):
 *   - Mounts `ChipTransportProvider` so any descendant can dispatch
 *     canonical chip transport intents via `useChipTransport()`. No
 *     existing animator is migrated yet; the provider sits dormant
 *     until Wave B opts in.
 *   - Renders a shell-owned overlay root (`data-canonical-shell-overlay-root`)
 *     that hosts `ChipTransportRuntime`. NOT a document.body portal —
 *     overlay ownership stays inside the shell so z-index, modal
 *     interaction, and viewport behavior remain shell-controlled.
 *   - Renders an invisible pot anchor marker
 *     (`data-canonical-shell-pot-anchor`) that the chip endpoint resolver
 *     uses as the canonical pot target. Zero size, zero layout impact;
 *     positioning is owned by gameplay surfaces in P8.1 (the marker
 *     piggybacks on the shell-root box centroid — adequate for the
 *     runtime smoke surface, will move when overlay migration lands).
 *
 * Unchanged from prior phases:
 *   - Transparent shell-root wrapper with diagnostic data attributes.
 *   - Optional SeatAnchorLayer composition.
 *   - shell-mounted / shell-unmounted telemetry once per mount.
 *   - Phase 7 wiring note: PlayfieldSlotController is NOT mounted here
 *     (gameplay surfaces wrap their own render site).
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { SeatAnchorLayer } from './SeatAnchorLayer';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { recordShellEvent } from './diagnostics';
import { ChipTransportProvider } from './ChipTransportProvider';
import { ChipTransportRuntime } from './ChipTransportRuntime';
import { setLifecycleFact, useLifecycleMount } from './lifecycleDebug';
import { isCanonicalShellBadgeEnabled } from '@/lib/debugFlags';
import {
  CanonicalAnnouncementProvider,
  CanonicalAnnouncementLayer,
  CanonicalCelebrationLayer,
  CanonicalAnnouncementDebugTrigger,
} from './announcements';
// P9.6: ShellPreHandSurface removed — gameplay surfaces (e.g. Gin Rummy)
// own their single authoritative felt geometry; the shell no longer
// renders a second pre-hand felt floor underneath.

// Shell-owned HUD announcement rail dimensions. Fixed. Not
// overridable by games. Sits between the shell-owned header and the
// opaque game children.
const SHELL_ANNOUNCEMENT_RAIL_HEIGHT_PX = 36;

import type { ProjectionMode, SeatAnchorInput } from './seatAnchors';

export interface PersistentTableShellProps {
  gameId?: string;
  gameType?: string;
  projectionMode?: ProjectionMode;
  viewerPosition?: number | null;
  seats?: SeatAnchorInput[];
  /**
   * Shell-owned HUD header chrome. Rendered above the canonical
   * announcement rail and the opaque game children. Authored by the
   * route (Game.tsx) so existing data wiring stays put, but its
   * placement and surrounding layout are owned by the shell.
   */
  header?: ReactNode;
  children: ReactNode;
}

// (preHandIntent removed in P9.6 — gameplay surfaces own felt geometry.)

export function PersistentTableShell({
  gameId,
  gameType,
  projectionMode,
  viewerPosition = null,
  seats,
  header,
  children,
}: PersistentTableShellProps) {

  const geometry = useGeometryTokensOptional();
  const shellRootRef = useRef<HTMLDivElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  useLifecycleMount('PersistentTableShell', { gameType });
  setLifecycleFact('Shell.bgClass', 'min-h-screen bg-shell-neutral');


  useEffect(() => {
    recordShellEvent('shell-mounted', {
      gameId: gameId ?? null,
      gameType: gameType ?? null,
      detail: {
        viewerPosition,
        device: geometry?.deviceType ?? null,
      },
    });
    return () => {
      recordShellEvent('shell-unmounted', {
        gameId: gameId ?? null,
        gameType: gameType ?? null,
        detail: { viewerPosition },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <div
      ref={shellRootRef}
      data-canonical-shell-root=""
      data-shell-device={geometry?.deviceType ?? undefined}
      data-shell-game-type={gameType ?? undefined}
      className="min-h-screen bg-shell-neutral"
      style={{ position: 'relative' }}
    >
      {/* TEMPORARY MIGRATION AID — canonical shell provenance badge.
          Rendered ONLY here, inside PersistentTableShell. If you see this
          marker on screen, the surface beneath is genuinely canonical.
          Disable via localStorage ptp_disable_canonical_badge="1" or
          URL ?disable_canonical_badge=1. Remove the flag + this block
          once waiting/session canonical migration is validated. */}
      {isCanonicalShellBadgeEnabled() && (
        <div
          data-canonical-shell-badge=""
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 6,
            right: 6,
            zIndex: 9999,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#0a0a0a',
            background: 'linear-gradient(135deg, #34d399, #10b981)',
            border: '1px solid rgba(0,0,0,0.4)',
            borderRadius: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          CSHELL · SLOT: {(gameType ?? 'WAITING').toString().toUpperCase()}
        </div>
      )}
      {/* P9.6: shell-owned pre-hand felt removed. Gameplay surfaces
          (e.g. GinRummyGameTable) render the single authoritative
          CanonicalFeltSurface inside their own table region. */}
      <div
        data-canonical-shell-column=""
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Shell-owned HUD header chrome. Authored by the route. */}
        {header ? (
          <div data-canonical-shell-header="" style={{ flex: '0 0 auto' }}>
            {header}
          </div>
        ) : null}

        {/* Opaque game subtree. */}
        <div
          data-canonical-shell-children=""
          style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {children}
        </div>

        {/* Shell-owned canonical announcement rail.
            TEMPORARY STRUCTURAL COMPROMISE (Pass 1 / Option A):
              - Rail lives at the bottom of the shell column, in the
                existing visual zone where per-game gameplay strips
                (e.g. Cribbage "Discard to Crib") render today.
              - Reserved 36px height to prevent layout hopping.
              - Idle container is visually neutral (transparent — no
                background, no border). Only the inner plate paints
                when an announcement is active.
              - Shell owns announcement state + rendering. True
                tab-bar promotion / named layout regions remain a
                future pass. Per-game CTA strips are NOT retired yet
                and may visually coexist for now. */}
        <div
          data-canonical-shell-announcement-rail=""
          style={{
            flex: '0 0 auto',
            height: SHELL_ANNOUNCEMENT_RAIL_HEIGHT_PX,
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
      </div>

      <CanonicalAnnouncementDebugTrigger
        dealerGameId={gameId ?? null}
        roundId={null}
      />


      {/* Shell-owned pot anchor — zero size, centered in shell-root.
          Invisible to users. Consumed by chipEndpoints resolver. */}
      <div
        data-canonical-shell-pot-anchor=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      />
      {/* Shell-owned overlay root — hosts ChipTransportRuntime portals.
          Pointer-events disabled; per-chip nodes opt in if needed. */}
      <div
        ref={overlayRootRef}
        data-canonical-shell-overlay-root=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 80,
        }}
      />
      <ChipTransportRuntime
        containerRef={shellRootRef}
        overlayRootRef={overlayRootRef}
      />
      {/* Shell-owned celebration overlay — distinct from the 36px
          lifecycle rail. Activates for CELEBRATION_TYPES (match_win
          today). Driven by the same CanonicalAnnouncementProvider
          context; no new emitters, no per-game overlays. */}
      <CanonicalCelebrationLayer />
    </div>
  );

  const wrapped = (
    <ChipTransportProvider gameId={gameId ?? null} gameType={gameType ?? null}>
      <CanonicalAnnouncementProvider
        dealerGameId={gameId ?? null}
        roundId={null}
      >
        {body}
      </CanonicalAnnouncementProvider>
    </ChipTransportProvider>
  );

  if (projectionMode && seats) {
    return (
      <SeatAnchorLayer
        projectionMode={projectionMode}
        viewerPosition={viewerPosition}
        seats={seats}
        gameId={gameId}
        gameType={gameType}
      >
        {wrapped}
      </SeatAnchorLayer>
    );
  }

  return wrapped;
}
