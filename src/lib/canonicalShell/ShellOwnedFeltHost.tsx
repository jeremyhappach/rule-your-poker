/**
 * ShellOwnedFeltHost — Phase 3.1a skeleton (Bucket 3 canonical felt unification).
 *
 * STATUS: SKELETON ONLY. NOT MOUNTED BY PersistentTableShell IN 3.1a.
 *
 * Purpose
 * -------
 * Define the single, shell-owned `CanonicalFeltSurface` mount point that
 * will eventually replace every per-surface felt across the platform.
 * In the end-state architecture (Bucket 3 hard invariant):
 *
 *   - At any instant during a session route, there is exactly one
 *     `data-canonical-felt-surface` node in the DOM.
 *   - That node is mounted ONCE on session entry and never unmounts
 *     for the duration of the session.
 *   - All lifecycle states (waiting, dealer selection, in-progress,
 *     game-over, configuring, session-ended) appear as content layered
 *     ABOVE the felt — never as a replacement FOR the felt.
 *
 * Ownership contract (3.1b cutover, not yet active)
 * -------------------------------------------------
 *   - PersistentTableShell mounts ONE <ShellOwnedFeltHost /> as a
 *     background layer behind the gameplay children column.
 *   - Gameplay surfaces (CribbageMobileGameTable, GinRummyGameTable,
 *     YahtzeeGameTable, then Holm/3-5-7/Horses/SCC during 3.2) STOP
 *     rendering their own <CanonicalFeltSurface /> and instead render
 *     transparent content above it.
 *   - The waiting surface (Phase 3.1b) renders inside the same shell
 *     envelope; its seat-select / share / bot-add overlay sits above
 *     the same shell felt and is removed without unmounting the felt.
 *
 * Geometry resolution
 * -------------------
 * Felt family + ante + skunk/legs/points-to-win subtitle are derived
 * from the active gameplay context via the `ShellFeltContextProvider`
 * (also a 3.1a skeleton — see below). Gameplay surfaces publish their
 * felt context once on mount via `useShellFeltContext().publish(...)`.
 * In 3.1a the provider exists but is a no-op (publish writes to a
 * local ref; the host falls back to default props).
 *
 * Single-felt invariant enforcement
 * ---------------------------------
 * 3.1b lands a DEV-only `useShellFeltInvariant` hook that asserts at
 * every animation frame during a session route that exactly one
 * `data-canonical-felt-surface` node exists. Violations log a loud
 * warning with the duplicate node's owning component (resolved via
 * `data-canonical-felt-game` / `data-canonical-felt-owner`).
 *
 * Rollback
 * --------
 * The 3.1b cutover is gated behind `isShellOwnedFeltEnabled()`
 * (`?shell_owned_felt=1` / `ptp_shell_owned_felt=1`). With the flag
 * OFF the platform behaves exactly as today: gameplay surfaces render
 * their own felts and the shell does not mount one. With the flag ON,
 * gameplay surfaces detect the shell-owned felt via context and skip
 * their local render, while the shell mounts the single canonical
 * felt. Switching the flag at runtime requires a route remount.
 */

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import {
  CanonicalFeltSurface,
  type CanonicalFeltGameKind,
  type CanonicalFeltSurfaceProps,
} from './CanonicalFeltSurface';
import { isShellOwnedFeltEnabled } from '@/lib/debugFlags';

// ---------------------------------------------------------------------------
// Felt context — surfaces publish their felt geometry / subtitle data once.
// ---------------------------------------------------------------------------

/**
 * Snapshot of every prop the shell-owned CanonicalFeltSurface needs.
 * Surfaces publish this; the host reads the latest published value.
 * `null` means "no surface has claimed the felt yet" — the host falls
 * back to a neutral, plate-less felt.
 */
export type ShellFeltContextValue = Omit<CanonicalFeltSurfaceProps, 'isWaitingPhase'> & {
  /**
   * When true, the host suppresses the game-name plate (used during
   * waiting / dealer-config phases where no game identity is committed).
   */
  isWaitingPhase?: boolean;
  /**
   * Diagnostic label — name of the surface that published this context.
   * Surfaces fingerprint themselves so the single-felt invariant can
   * attribute duplicate renders.
   */
  publisherLabel?: string;
};

interface ShellFeltContextApi {
  /** Surfaces call this on mount/update to publish their felt context. */
  publish: (value: ShellFeltContextValue | null) => void;
  /**
   * `true` iff the shell-owned-felt feature flag is ON for this route.
   * Gameplay surfaces read this to decide whether to suppress their
   * own local <CanonicalFeltSurface /> render.
   */
  shellOwnsFelt: boolean;
  /**
   * Current published value (ref-backed; reads in render must be
   * understood as latest-snapshot-only — NOT a reactive subscription).
   * 3.1b will add a reactive variant if the host needs to re-render
   * on every publish.
   */
  readLatest: () => ShellFeltContextValue | null;
}

const ShellFeltContext = createContext<ShellFeltContextApi | null>(null);

export interface ShellFeltContextProviderProps {
  children: ReactNode;
}

/**
 * Provider mounted inside PersistentTableShell ABOVE the gameplay
 * children. In 3.1a this is a passive holder — `publish()` writes to
 * a ref, and `shellOwnsFelt` reflects the feature flag so consumers
 * can wire conditional render today without behavior change.
 */
export function ShellFeltContextProvider({ children }: ShellFeltContextProviderProps) {
  const latestRef = useRef<ShellFeltContextValue | null>(null);
  const shellOwnsFelt = isShellOwnedFeltEnabled();

  const api = useMemo<ShellFeltContextApi>(
    () => ({
      publish: (value) => {
        latestRef.current = value;
      },
      shellOwnsFelt,
      readLatest: () => latestRef.current,
    }),
    [shellOwnsFelt],
  );

  return <ShellFeltContext.Provider value={api}>{children}</ShellFeltContext.Provider>;
}

/**
 * Hook used by gameplay surfaces to:
 *   1. Decide whether to suppress their local <CanonicalFeltSurface />
 *      render (`shellOwnsFelt === true`).
 *   2. Publish their felt geometry/subtitle data so the shell-owned
 *      host can render the canonical felt with the correct family
 *      identity, ante, skunk thresholds, etc.
 *
 * Safe to call outside a provider — returns a stable no-op API with
 * `shellOwnsFelt === false`, matching today's behavior.
 */
export function useShellFeltContext(): ShellFeltContextApi {
  const ctx = useContext(ShellFeltContext);
  if (ctx) return ctx;
  // No provider mounted → behave exactly as today.
  return NO_OP_API;
}

const NO_OP_API: ShellFeltContextApi = {
  publish: () => {},
  shellOwnsFelt: false,
  readLatest: () => null,
};

// ---------------------------------------------------------------------------
// Shell-owned felt host — the single canonical felt mount point.
// ---------------------------------------------------------------------------

export interface ShellOwnedFeltHostProps {
  /**
   * Optional override — if the route knows the game-kind eagerly
   * (e.g. from the URL or persisted dealer-game cache) it can pass it
   * here so the felt paints with the correct family identity on the
   * very first frame, before any surface has had a chance to publish.
   */
  initialGameKind?: CanonicalFeltGameKind | null;
  /**
   * Optional initial ante for the same first-frame reason as above.
   */
  initialAnteAmount?: number | string;
  /**
   * Optional initial waiting-phase flag — when true on first frame
   * the host renders without a plate (matches the waiting/cold-start
   * presentation today).
   */
  initialIsWaitingPhase?: boolean;
}

/**
 * 3.1a SKELETON.
 *
 * Renders ONE absolutely-positioned `CanonicalFeltSurface` behind the
 * gameplay column. In 3.1a this component is exported but NOT mounted
 * by PersistentTableShell — Game.tsx and surfaces keep rendering their
 * own felts exactly as today. In 3.1b, PersistentTableShell mounts
 * this host once and gameplay surfaces stop rendering their local
 * <CanonicalFeltSurface /> when `useShellFeltContext().shellOwnsFelt`
 * is true.
 *
 * Geometry note: when mounted by the shell, this host occupies the
 * shell-root's background layer (absolute inset-0 behind the gameplay
 * column). CanonicalFeltSurface internally positions itself absolutely
 * within its parent, so the host's only job is to provide the
 * correctly-sized parent box. Per-family geometry (cribbage circle vs
 * ellipse for everyone else) is handled inside CanonicalFeltSurface
 * via `gameKind`.
 */
export function ShellOwnedFeltHost({
  initialGameKind = null,
  initialAnteAmount = 0,
  initialIsWaitingPhase = true,
}: ShellOwnedFeltHostProps) {
  const ctx = useShellFeltContext();
  // 3.1a: read once at render time. 3.1b will likely promote this to
  // a state-driven subscription so the host re-renders when surfaces
  // publish new context (e.g. ante config changes mid-session).
  const published = ctx.readLatest();

  const gameKind: CanonicalFeltGameKind = (published?.gameKind ?? initialGameKind ?? 'holm-game');
  const anteAmount = published?.anteAmount ?? initialAnteAmount;
  const isWaitingPhase = published?.isWaitingPhase ?? initialIsWaitingPhase;

  return (
    <div
      data-canonical-shell-felt-host=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        // Behind the gameplay column (z-index: 1) and below the
        // overlay root (z-index: 80) and announcement rail.
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <CanonicalFeltSurface
        gameKind={gameKind}
        anteAmount={anteAmount}
        potMaxEnabled={published?.potMaxEnabled}
        potMaxValue={published?.potMaxValue}
        legsToWin={published?.legsToWin}
        pointsToWin={published?.pointsToWin}
        isWaitingPhase={isWaitingPhase}
        isTablet={published?.isTablet}
        isDesktop={published?.isDesktop}
        cribbageSkunk={published?.cribbageSkunk}
      />
    </div>
  );
}
