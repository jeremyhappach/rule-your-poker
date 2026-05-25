/**
 * ShellOwnedFeltHost — Phase 3.1b (Bucket 3 canonical felt unification).
 *
 * STATUS: Live behind `isShellOwnedFeltEnabled()` (default OFF).
 *
 * Purpose
 * -------
 * Define the single, shell-owned `CanonicalFeltSurface` mount point that
 * eventually replaces every per-surface felt across the platform.
 * Hard invariant: at any instant during a session route, exactly one
 * `data-canonical-felt-surface` node exists in the DOM, mounted ONCE on
 * session entry, never unmounted across lifecycle states.
 *
 * 3.1b deltas over 3.1a skeleton:
 *   - Reactive provider: surfaces' `publish(...)` updates state and the
 *     host re-renders deterministically (e.g. mid-session ante changes).
 *   - `initialGameKind` / `initialIsWaitingPhase` / `initialAnteAmount`
 *     hydrate the first frame so the shell paints the correct family
 *     identity before any surface mounts — no fallback flash.
 *   - DEV-only `useShellFeltInvariant()` hook (warn-only) checks at each
 *     animation frame that exactly one canonical felt node exists.
 *
 * Rollback: flag OFF restores prior behavior byte-for-byte. Surfaces
 * detect the shell-owned felt via `useShellFeltContext().shellOwnsFelt`
 * and skip their local render only when the flag is ON.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CanonicalFeltSurface,
  type CanonicalFeltGameKind,
  type CanonicalFeltSurfaceProps,
} from './CanonicalFeltSurface';
import { isShellOwnedFeltEnabled } from '@/lib/debugFlags';
import { isFeltlessPokerFamily } from './pokerShellCutover';

// ---------------------------------------------------------------------------
// Felt context — surfaces publish their felt geometry / subtitle data.
// ---------------------------------------------------------------------------

export type ShellFeltContextValue = Omit<CanonicalFeltSurfaceProps, 'isWaitingPhase'> & {
  isWaitingPhase?: boolean;
  /** Diagnostic label — name of the surface that published this context. */
  publisherLabel?: string;
};

interface ShellFeltApi {
  publish: (value: ShellFeltContextValue | null) => void;
  shellOwnsFelt: boolean;
}

/**
 * Two contexts on purpose:
 *
 *   - `ShellFeltApiContext` — STABLE for the lifetime of the provider.
 *     Publishers consume this; its identity never changes, so
 *     `usePublishShellFelt`'s effect does not re-fire on every state
 *     update. (The earlier single-context design caused a
 *     publish-null / publish-value thrash that briefly cleared the
 *     felt during transitions — observed as the Cribbage felt
 *     "disappearing" at the high-card boundary.)
 *
 *   - `ShellFeltStateContext` — REACTIVE. Only the host subscribes,
 *     so renders are confined to the felt host itself.
 */
const ShellFeltApiContext = createContext<ShellFeltApi | null>(null);
const ShellFeltStateContext = createContext<ShellFeltContextValue | null>(null);

export interface ShellFeltContextProviderProps {
  children: ReactNode;
  /**
   * Optional game_type. When provided, also enables shell-owned felt
   * ownership for poker-variant families registered via
   * `POKER_SHELL_FELTLESS_FAMILIES` (Phase 3.2 cutover), independent
   * of the global `isShellOwnedFeltEnabled()` flag.
   */
  gameType?: string | null;
}

export function ShellFeltContextProvider({ children, gameType = null }: ShellFeltContextProviderProps) {
  const [current, setCurrent] = useState<ShellFeltContextValue | null>(null);
  const shellOwnsFelt = isShellOwnedFeltEnabled() || isFeltlessPokerFamily(gameType);

  // Stable publish — never changes identity. Uses functional setState
  // with a shallow-equality guard so idempotent publishes don't cause
  // re-renders.
  const publish = useCallback((value: ShellFeltContextValue | null) => {
    setCurrent((prev) => (shallowFeltEqual(prev, value) ? prev : value));
  }, []);

  // API ref is stable for the provider's lifetime (shellOwnsFelt is
  // driven by the feature flag and does not flip mid-session).
  const api = useMemo<ShellFeltApi>(
    () => ({ publish, shellOwnsFelt }),
    [publish, shellOwnsFelt],
  );

  return (
    <ShellFeltApiContext.Provider value={api}>
      <ShellFeltStateContext.Provider value={current}>
        {children}
      </ShellFeltStateContext.Provider>
    </ShellFeltApiContext.Provider>
  );
}

function shallowFeltEqual(
  a: ShellFeltContextValue | null,
  b: ShellFeltContextValue | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.gameKind !== b.gameKind ||
    a.anteAmount !== b.anteAmount ||
    a.potMaxEnabled !== b.potMaxEnabled ||
    a.potMaxValue !== b.potMaxValue ||
    a.legsToWin !== b.legsToWin ||
    a.pointsToWin !== b.pointsToWin ||
    a.isWaitingPhase !== b.isWaitingPhase ||
    a.isTablet !== b.isTablet ||
    a.isDesktop !== b.isDesktop ||
    a.publisherLabel !== b.publisherLabel
  ) {
    return false;
  }
  const sa = a.cribbageSkunk;
  const sb = b.cribbageSkunk;
  if (sa === sb) return true;
  if (!sa || !sb) return false;
  return (
    sa.skunkEnabled === sb.skunkEnabled &&
    sa.skunkThreshold === sb.skunkThreshold &&
    sa.doubleSkunkEnabled === sb.doubleSkunkEnabled &&
    sa.doubleSkunkThreshold === sb.doubleSkunkThreshold
  );
}

/** Back-compat shape exposed to surfaces. */
export interface ShellFeltContextApi extends ShellFeltApi {
  /** Latest snapshot. Reading this subscribes the caller to felt-state re-renders. */
  current: ShellFeltContextValue | null;
}

const NO_OP_API: ShellFeltApi = {
  publish: () => {},
  shellOwnsFelt: false,
};

/**
 * Hook for gameplay surfaces. Returns the STABLE api plus a `current`
 * snapshot. Most publishers should ignore `current` and only call
 * `publish(...)`.
 */
export function useShellFeltContext(): ShellFeltContextApi {
  const api = useContext(ShellFeltApiContext) ?? NO_OP_API;
  const current = useContext(ShellFeltStateContext);
  return useMemo(() => ({ ...api, current }), [api, current]);
}

/** Host-only subscription to the reactive felt state. */
function useShellFeltState(): ShellFeltContextValue | null {
  return useContext(ShellFeltStateContext);
}

/**
 * Imperative publish helper. Depends only on the STABLE api, so the
 * effect re-fires only when the published value itself changes —
 * never as a side-effect of the provider re-rendering. This is the
 * fix for the Cribbage high-card felt-disappearance regression.
 */
export function usePublishShellFelt(value: ShellFeltContextValue | null): void {
  const api = useContext(ShellFeltApiContext) ?? NO_OP_API;
  useEffect(() => {
    if (!api.shellOwnsFelt) return;
    api.publish(value);
    return () => {
      api.publish(null);
    };
  }, [api, JSON.stringify(value)]);
}


// ---------------------------------------------------------------------------
// Single-felt invariant — DEV-only, warn-only.
// ---------------------------------------------------------------------------

/**
 * Warn-only: never throws. Polls the DOM (rAF-throttled) and logs a
 * single console.warn per offending frame when more than one
 * `data-canonical-felt-surface` node is present. No-op when the flag is
 * OFF or in production.
 */
export function useShellFeltInvariant(): void {
  useEffect(() => {
    if (!isShellOwnedFeltEnabled()) return;
    if (typeof window === 'undefined') return;
    if (import.meta.env.PROD) return;

    let raf = 0;
    let lastWarnCount = -1;
    const tick = () => {
      const host = document.querySelector('[data-canonical-shell-felt-host]') as HTMLElement | null;
      const nodes = document.querySelectorAll('[data-canonical-felt-surface]');
      if (!host && lastWarnCount !== 0) {
        lastWarnCount = 0;
        // eslint-disable-next-line no-console
        console.warn('[ShellOwnedFelt] invariant violation: host is not mounted');
      } else if (host && nodes.length === 0 && lastWarnCount !== 0) {
        lastWarnCount = 0;
        // eslint-disable-next-line no-console
        console.warn('[ShellOwnedFelt] invariant violation: host mounted without visible felt node', {
          context: host.getAttribute('data-shell-felt-context') ?? null,
        });
      }
      if (nodes.length > 1 && nodes.length !== lastWarnCount) {
        lastWarnCount = nodes.length;
        const owners = Array.from(nodes).map(
          (n) =>
            (n as HTMLElement).getAttribute('data-canonical-felt-owner') ??
            (n as HTMLElement).getAttribute('data-canonical-felt-game') ??
            '(unknown)',
        );
        // eslint-disable-next-line no-console
        console.warn(
          '[ShellOwnedFelt] invariant violation: multiple canonical felts mounted',
          { count: nodes.length, owners },
        );
      } else if (host && nodes.length === 1 && lastWarnCount !== -1) {
        lastWarnCount = -1;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);
}

// ---------------------------------------------------------------------------
// Shell-owned felt host — the single canonical felt mount point.
// ---------------------------------------------------------------------------

export interface ShellOwnedFeltHostProps {
  initialGameKind?: CanonicalFeltGameKind | null;
  initialAnteAmount?: number | string;
  initialIsWaitingPhase?: boolean;
}

/**
 * Renders ONE absolutely-positioned `CanonicalFeltSurface` behind the
 * gameplay column. Mounted by `PersistentTableShell` only when
 * `isShellOwnedFeltEnabled()` is true.
 *
 * First-frame hydration: `initialGameKind` / `initialIsWaitingPhase`
 * (typically derived from `game.game_type` in the route) ensure the
 * felt paints the correct family identity before any surface publishes.
 */
export function ShellOwnedFeltHost({
  initialGameKind = null,
  initialAnteAmount = 0,
  initialIsWaitingPhase = true,
}: ShellOwnedFeltHostProps) {
  const published = useShellFeltState();

  // Sticky last-non-null snapshot. Surfaces unmount/remount across
  // phase boundaries (e.g. high-card → first-deal); each cleanup
  // momentarily publishes `null` before the next surface's mount
  // effect re-publishes. Without stickiness, those one-frame nulls
  // would collapse the felt back to the initial waiting state and
  // visibly blink. The shell felt MUST stay continuous.
  const stickyRef = useRef<ShellFeltContextValue | null>(null);
  if (published) {
    stickyRef.current = published;
  }
  const effective = published ?? stickyRef.current;

  const gameKind: CanonicalFeltGameKind =
    effective?.gameKind ?? initialGameKind ?? 'holm-game';
  const anteAmount = effective?.anteAmount ?? initialAnteAmount;
  const isWaitingPhase = effective?.isWaitingPhase ?? initialIsWaitingPhase;
  const hasPublished = !!published;
  const hasSticky = !!stickyRef.current;
  const publisherLabel = effective?.publisherLabel ?? null;
  const hostTrace = useMemo(
    () => ({
      publisherLabel,
      gameKind,
      anteAmount,
      isWaitingPhase,
      hasPublished,
      hasSticky,
    }),
    [publisherLabel, gameKind, anteAmount, isWaitingPhase, hasPublished, hasSticky],
  );

  useEffect(() => {
    if (import.meta.env.PROD) return;
    // eslint-disable-next-line no-console
    console.info('[ShellOwnedFelt] host mounted');
    return () => {
      // eslint-disable-next-line no-console
      console.warn('[ShellOwnedFelt] host unmounted');
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    // eslint-disable-next-line no-console
    console.info('[ShellOwnedFelt] render context', hostTrace);
  }, [hostTrace]);

  // DEV-only, warn-only invariant — never throws.
  useShellFeltInvariant();

  // Phase 3.1b' — shell-owned path uses the shared canonical ellipse for
  // every family. No per-family geometry branches. Flag-OFF production
  // (local CanonicalFeltSurface mounted inside each game table) is
  // untouched.
  return (
    <div
      data-canonical-shell-felt-host=""
      data-canonical-felt-owner="shell-owned-felt-host"
      data-shell-felt-mounted="true"
      data-shell-felt-context={JSON.stringify(hostTrace)}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        data-canonical-shell-felt-frame=""
        data-canonical-shell-felt-geometry="ellipse"
        style={{
          // Top-anchored positioning — independent of parent row height.
          // Earlier center-based positioning (`top: calc(50% - 132px);
          // translate(-50%, -50%)`) clipped the bottom of the ellipse
          // during the transient waiting-for-ante phase, where the
          // gameplay row height temporarily differs from steady-state.
          // A fixed top offset paints the canonical position from the
          // first frame regardless of children-row layout flux.
          //
          // Height is sized to fit fully INSIDE the gameplay surface's
          // top section (Cribbage uses `min(90vw, calc(55vh - 32px))
          // + 10px`). Earlier `min(52vh, 420px)` sat ~26px past that
          // boundary; in gameplay the surface's own content masked
          // the seam, but during ante (empty content + opaque
          // bg-background on the HUD region + visible rail plate) the
          // overflow was exposed as a "clipped bottom." Bounding the
          // ellipse to the top-section envelope eliminates the
          // transient clip without changing steady-state appearance.
          position: 'absolute',
          left: '50%',
          top: 24,
          width: 'min(94vw, 720px)',
          height: 'min(86vw, calc(55vh - 64px), 400px)',
          minWidth: 300,
          minHeight: 220,
          transform: 'translateX(-50%)',
        }}
      >
        <CanonicalFeltSurface
          gameKind={gameKind}
          geometryVariant="ellipse"
          feltOwner="shell-owned-felt-host"
          anteAmount={anteAmount}
          potMaxEnabled={effective?.potMaxEnabled}
          potMaxValue={effective?.potMaxValue}
          legsToWin={effective?.legsToWin}
          pointsToWin={effective?.pointsToWin}
          isWaitingPhase={isWaitingPhase}
          isTablet={effective?.isTablet}
          isDesktop={effective?.isDesktop}
          cribbageSkunk={effective?.cribbageSkunk}
        />
      </div>
    </div>
  );
}


/**
 * Derive the canonical felt game-kind from a session `game.game_type`
 * string. Used by `PersistentTableShell` to hydrate the host's first
 * frame so it doesn't fall back to a neutral family.
 */
export function deriveFeltGameKind(
  gameType: string | null | undefined,
): CanonicalFeltGameKind | null {
  switch (gameType) {
    case 'cribbage':
    case 'gin-rummy':
    case 'yahtzee':
    case 'holm-game':
    case 'three-five-seven':
    case 'horses':
    case 'ship-captain-crew':
      return gameType;
    default:
      return null;
  }
}
