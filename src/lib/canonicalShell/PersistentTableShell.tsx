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
// P9.6: ShellPreHandSurface removed — gameplay surfaces (e.g. Gin Rummy)
// own their single authoritative felt geometry; the shell no longer
// renders a second pre-hand felt floor underneath.
import type { ProjectionMode, SeatAnchorInput } from './seatAnchors';

export interface PersistentTableShellProps {
  gameId?: string;
  gameType?: string;
  projectionMode?: ProjectionMode;
  viewerPosition?: number | null;
  seats?: SeatAnchorInput[];
  children: ReactNode;
}

// (preHandIntent removed in P9.6 — gameplay surfaces own felt geometry.)

export function PersistentTableShell({
  gameId,
  gameType,
  projectionMode,
  viewerPosition = null,
  seats,
  children,
}: PersistentTableShellProps) {

  const geometry = useGeometryTokensOptional();
  const shellRootRef = useRef<HTMLDivElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);

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
      style={{ position: 'relative' }}
    >
      {/* P9.5: shell-owned pre-hand felt floor. Persists while a
          gameplay slot is mounted so the viewport is never blank
          between mount and first authoritative viewState. Sits BELOW
          gameplay content in z-order. */}
      {preHandIntent ? <ShellPreHandSurface intent={preHandIntent} /> : null}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>

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
    </div>
  );

  const wrapped = (
    <ChipTransportProvider gameId={gameId ?? null} gameType={gameType ?? null}>
      {body}
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
