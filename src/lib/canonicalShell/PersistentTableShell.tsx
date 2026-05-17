/**
 * PersistentTableShell — canonical shell ownership boundary (Phase 4).
 *
 * Scaffolding only. Mounts as a transparent wrapper inside the game
 * surface and establishes a single anchor point for later phases that
 * will lift table-shell concerns above Game.tsx lifecycle branches.
 *
 * Phase 4 scope:
 *   - Transparent wrapper <div data-canonical-shell-root> — no styling,
 *     no positioning, no z-index, no className.
 *   - Optional SeatAnchorLayer composition when seat/projection inputs
 *     are provided (kept optional so MobileGameTable wiring does not
 *     need to thread seat data in this phase — current consumers use
 *     the pure resolver directly).
 *   - Reads useGeometryTokensOptional() to stamp a data-shell-device
 *     attribute for diagnostics. Does NOT introduce a new provider.
 *   - Emits shell-mount / shell-unmount telemetry once per mount.
 *
 * Explicitly NOT in scope: lifecycle restructuring of Game.tsx,
 * overlay consolidation, chip transport, transition choreography,
 * sync framework behavior, visual changes.
 */

import { useEffect, type ReactNode } from 'react';
import { SeatAnchorLayer } from './SeatAnchorLayer';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { recordShellEvent } from './diagnostics';
import type { ProjectionMode, SeatAnchorInput } from './seatAnchors';

export interface PersistentTableShellProps {
  gameId?: string;
  gameType?: string;
  /** Optional. When provided alongside seats, mounts SeatAnchorLayer. */
  projectionMode?: ProjectionMode;
  viewerPosition?: number | null;
  seats?: SeatAnchorInput[];
  children: ReactNode;
}

export function PersistentTableShell({
  gameId,
  gameType,
  projectionMode,
  viewerPosition = null,
  seats,
  children,
}: PersistentTableShellProps) {
  const geometry = useGeometryTokensOptional();

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
    // Intentionally mount/unmount once per shell instance — telemetry
    // should not fire on incidental prop churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <div
      data-canonical-shell-root=""
      data-shell-device={geometry?.deviceType ?? undefined}
      data-shell-game-type={gameType ?? undefined}
    >
      {children}
    </div>
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
        {body}
      </SeatAnchorLayer>
    );
  }

  return body;
}
