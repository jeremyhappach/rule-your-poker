/**
 * SeatAnchorLayer — React provider for canonical seat anchor resolution.
 *
 * Phase 1 deliverable: standalone provider + hook. Not yet wired into
 * MobileGameTable. Consumers (introduced in later phases) read anchors
 * via useSeatAnchors() instead of recomputing per-component.
 *
 * Resolution is memoized on inputs so re-renders without seat changes
 * are stable. Projection mode is recorded once per change for
 * telemetry (INV-shell-5).
 */

import { createContext, useContext, useMemo, useRef, useEffect, type ReactNode } from 'react';
import {
  resolveSeatAnchors,
  type ProjectionMode,
  type ResolvedSeatAnchor,
  type SeatAnchorInput,
} from './seatAnchors';
import { recordShellEvent } from './diagnostics';

interface SeatAnchorContextValue {
  projectionMode: ProjectionMode;
  viewerPosition: number | null;
  anchors: ResolvedSeatAnchor[];
  byPosition: Map<number, ResolvedSeatAnchor>;
}

const SeatAnchorContext = createContext<SeatAnchorContextValue | null>(null);

interface SeatAnchorLayerProps {
  projectionMode: ProjectionMode;
  viewerPosition: number | null;
  seats: SeatAnchorInput[];
  gameId?: string;
  gameType?: string;
  children: ReactNode;
}

export function SeatAnchorLayer({
  projectionMode,
  viewerPosition,
  seats,
  gameId,
  gameType,
  children,
}: SeatAnchorLayerProps) {
  // Stable seat-key string so anchor recomputation is keyed on actual
  // changes (positions, occupancy, hidden flags) instead of array identity.
  const seatKey = useMemo(
    () =>
      seats
        .map(s => `${s.position}:${s.occupied ? 1 : 0}:${s.hidden ? 1 : 0}`)
        .sort()
        .join('|'),
    [seats],
  );

  const value = useMemo<SeatAnchorContextValue>(() => {
    const anchors = resolveSeatAnchors({
      projectionMode,
      viewerPosition,
      seats,
      gameId,
      gameType,
    });
    const byPosition = new Map(anchors.map(a => [a.position, a]));
    return { projectionMode, viewerPosition, anchors, byPosition };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionMode, viewerPosition, seatKey, gameId, gameType]);

  // Telemetry: record projection-mode changes once per change.
  const lastModeRef = useRef<ProjectionMode | null>(null);
  useEffect(() => {
    if (lastModeRef.current !== projectionMode) {
      recordShellEvent('seat-anchor-projection-changed', {
        gameId: gameId ?? null,
        gameType: gameType ?? null,
        detail: { from: lastModeRef.current, to: projectionMode },
      });
      lastModeRef.current = projectionMode;
    }
  }, [projectionMode, gameId, gameType]);

  return (
    <SeatAnchorContext.Provider value={value}>
      {children}
    </SeatAnchorContext.Provider>
  );
}

/** Read the resolved anchor table. Throws if used outside the provider. */
export function useSeatAnchors(): SeatAnchorContextValue {
  const v = useContext(SeatAnchorContext);
  if (!v) {
    throw new Error('useSeatAnchors must be used inside <SeatAnchorLayer>');
  }
  return v;
}

/** Optional variant: returns null instead of throwing (for gradual adoption). */
export function useSeatAnchorsOptional(): SeatAnchorContextValue | null {
  return useContext(SeatAnchorContext);
}
