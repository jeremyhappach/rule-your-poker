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
import { isCanonicalSeatConsumer } from './shellRouting';
import { useLifecycleMount } from './lifecycleDebug';
import { useUnmountSnapshot } from './shellLifecycleLog';
import { useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';
import { ShellViewerChipEndpoint } from './ShellViewerChipEndpoint';

interface SeatAnchorContextValue {
  projectionMode: ProjectionMode;
  viewerPosition: number | null;
  anchors: ResolvedSeatAnchor[];
  byPosition: Map<number, ResolvedSeatAnchor>;
  /** Stable identifier for THIS provider instance — changes whenever the
   *  React-tree position of the provider remounts. Used by Wartime to
   *  prove whether the provider survived a surface transition. */
  providerInstanceId: string;
}

const SeatAnchorContext = createContext<SeatAnchorContextValue | null>(null);

let _seatAnchorProviderSeq = 0;

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
  useLifecycleMount('SeatAnchorLayer', { gameType: gameType ?? null });
  useStartupMountTrace('SeatAnchorLayer', { gameId: gameId ?? null, gameType: gameType ?? null, projectionMode, viewerPosition });
  useStartupRenderTrace('SeatAnchorLayer', {
    projectionMode,
    viewerPosition,
    seatCount: seats.length,
    seats: seats.map(s => ({ position: s.position, occupied: s.occupied, hidden: s.hidden })),
    gameId: gameId ?? null,
    gameType: gameType ?? null,
  }, { file: 'src/lib/canonicalShell/SeatAnchorLayer.tsx' });
  useUnmountSnapshot('SeatAnchorLayer', {
    parent: 'PersistentTableShell (mounted only when projectionMode && seats)',
    projectionMode,
    viewerPosition,
    seatCount: seats?.length ?? null,
    gameId: gameId ?? null,
    gameType: gameType ?? null,
  });
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

  // Stable per-mount provider id so cross-surface diffs can tell
  // whether the same provider survived a surface transition.
  const providerInstanceIdRef = useRef<string>('');
  if (!providerInstanceIdRef.current) {
    providerInstanceIdRef.current = `seat-anchor-${++_seatAnchorProviderSeq}`;
  }

  const value = useMemo<SeatAnchorContextValue>(() => {
    const anchors = resolveSeatAnchors({
      projectionMode,
      viewerPosition,
      seats,
      gameId,
      gameType,
    });
    const byPosition = new Map(anchors.map(a => [a.position, a]));
    return {
      projectionMode,
      viewerPosition,
      anchors,
      byPosition,
      providerInstanceId: providerInstanceIdRef.current,
    };
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
      {/* Shell-owned viewer chip endpoint — guarantees a canonical
          `[data-chip-center]` exists for the local viewer even when
          CanonicalSeatCluster suppresses self-render. Required so
          ChipTransportRuntime can resolve the destination when the
          viewer is the winner of an Economy transfer. */}
      <ShellViewerChipEndpoint />
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

/**
 * Optional variant — returns null instead of throwing. Use ONLY when a
 * component intentionally supports both anchor-driven and standalone
 * mounting. Canonical seat consumers should use
 * `useRequiredSeatAnchors(gameType)` instead so missing-provider
 * misconfigurations fail loudly during development rather than
 * silently rendering empty seat clusters.
 */
export function useSeatAnchorsOptional(): SeatAnchorContextValue | null {
  return useContext(SeatAnchorContext);
}

/**
 * Strict variant for registered canonical seat consumers. In dev,
 * throws loudly when the game_type is in CANONICAL_SEAT_CONSUMERS but
 * no <SeatAnchorLayer> is mounted above — exactly the wiring failure
 * that wiped chip stacks across the Gin and Cribbage migrations
 * (consumer rendered with all-null slots because the family registry
 * and the provider mount diverged). In production it returns null so a
 * wiring miss degrades to the same broken-but-not-crashed state as
 * before, while build/test/dev/code-review catch recurrence early.
 * See .lovable/canonical-shell-onboarding-checklist.md.
 */
export function useRequiredSeatAnchors(
  gameType: string | null | undefined,
): SeatAnchorContextValue | null {
  const v = useContext(SeatAnchorContext);
  if (!v && import.meta.env.DEV && isCanonicalSeatConsumer(gameType)) {
    throw new Error(
      `[SeatAnchorLayer] game_type "${gameType}" is registered as a ` +
        `canonical seat consumer but no <SeatAnchorLayer> is mounted ` +
        `above this component. This usually means the game_type is ` +
        `missing from CANONICAL_SHELL_FAMILY in shellRouting.ts, so ` +
        `Game.tsx skipped mounting the shell-owned anchor provider. ` +
        `See .lovable/canonical-shell-onboarding-checklist.md.`,
    );
  }
  return v;
}
