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

import {
  ShellFeltContextProvider,
  ShellOwnedFeltHost,
  deriveFeltGameKind,
} from './ShellOwnedFeltHost';

import {
  CanonicalAnnouncementProvider,
  CanonicalCelebrationLayer,
  CanonicalAnnouncementDebugTrigger,
} from './announcements';
import { ShellTabBarProvider } from './ShellTabBar';
// P9.6: ShellPreHandSurface removed — gameplay surfaces (e.g. Gin Rummy)
// own their single authoritative felt geometry; the shell no longer
// renders a second pre-hand felt floor underneath.

// Shell-owned chrome: the canonical announcement rail and tab bar are
// exposed via `ShellHudChrome` and must be mounted by gameplay surfaces
// at the top of their unified HUD stack, directly below gameplay. Games
// publish tab metadata via `useShellTabBar`; they never render tab nav.

import type { ProjectionMode, SeatAnchorInput } from './seatAnchors';

export interface PersistentTableShellProps {
  gameId?: string;
  gameType?: string;
  projectionMode?: ProjectionMode;
  viewerPosition?: number | null;
  /**
   * Authenticated viewer's user id. Threaded into the canonical
   * announcement provider so the rail layer can enforce actor-only
   * visibility on `cta_prompt` events.
   */
  viewerUserId?: string | null;
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
  viewerUserId = null,
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
      className="min-h-screen bg-background"
      style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}
    >
      {/* CSHELL provenance badge removed — canonical shell migration validated. */}
      <div
        data-canonical-shell-column=""
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          // Proportional viewport contract (see index.css):
          //   row 1 — header rail at exactly --shell-header-h
          //          (max of pixel floor and ratio*100dvh).
          //   row 2 — gameplay + HUD region, which internally sizes
          //          felt to --shell-play-h and HUD to --shell-hud-h
          //          via flex-basis. This makes the play/HUD boundary
          //          a shell-owned pixel edge on every device.
          gridTemplateRows: header
            ? 'var(--shell-header-h) minmax(0, 1fr)'
            : 'minmax(0, 1fr)',
          height: '100%',
          minHeight: 0,
        }}
      >
        {/* 1. Shell-owned header chrome. Authored by the route. */}
        {header ? (
          <div data-canonical-shell-header="" style={{ minHeight: 0 }}>
            {header}
          </div>
        ) : null}

        {/* 2. Gameplay surface + unified HUD stack. The ONLY flexible row. */}
        <div
          data-canonical-shell-children=""
          style={{ position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* Shell-owned canonical felt — mounted ONCE, unconditionally,
              for the entire session lifecycle. Game surfaces publish
              their felt context via `usePublishShellFelt` and NEVER
              render felt themselves. There is no opt-in or per-family
              registry: local felt ownership has been retired. */}
          <ShellOwnedFeltHost
            initialGameKind={deriveFeltGameKind(gameType)}
            initialIsWaitingPhase={!gameType}
          />

          <div
            data-canonical-shell-slot-content=""
            style={{ position: 'relative', zIndex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }}
          >
            {children}
          </div>
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
        viewerUserId={viewerUserId}
      >
        <ShellTabBarProvider>
          <ShellFeltContextProvider>{body}</ShellFeltContextProvider>
        </ShellTabBarProvider>
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
