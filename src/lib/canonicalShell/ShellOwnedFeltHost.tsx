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

// ---------------------------------------------------------------------------
// Felt context — surfaces publish their felt geometry / subtitle data.
// ---------------------------------------------------------------------------

export type ShellFeltContextValue = Omit<CanonicalFeltSurfaceProps, 'isWaitingPhase'> & {
  isWaitingPhase?: boolean;
  /** Diagnostic label — name of the surface that published this context. */
  publisherLabel?: string;
};

interface ShellFeltContextApi {
  publish: (value: ShellFeltContextValue | null) => void;
  shellOwnsFelt: boolean;
  /** Latest snapshot, reactive — host re-renders on change. */
  current: ShellFeltContextValue | null;
}

const ShellFeltContext = createContext<ShellFeltContextApi | null>(null);

export interface ShellFeltContextProviderProps {
  children: ReactNode;
}

/**
 * Reactive provider. `publish(...)` stores the latest snapshot in state
 * so the shell-owned host re-renders when surfaces change their felt
 * context (ante config, points-to-win, waiting → in-progress, etc.).
 *
 * Shallow-equality guard prevents render loops from idempotent publishes.
 */
export function ShellFeltContextProvider({ children }: ShellFeltContextProviderProps) {
  const [current, setCurrent] = useState<ShellFeltContextValue | null>(null);
  const shellOwnsFelt = isShellOwnedFeltEnabled();

  const publish = useCallback((value: ShellFeltContextValue | null) => {
    setCurrent((prev) => (shallowFeltEqual(prev, value) ? prev : value));
  }, []);

  const api = useMemo<ShellFeltContextApi>(
    () => ({ publish, shellOwnsFelt, current }),
    [publish, shellOwnsFelt, current],
  );

  return <ShellFeltContext.Provider value={api}>{children}</ShellFeltContext.Provider>;
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

/**
 * Hook used by gameplay surfaces to:
 *   1. Decide whether to suppress their local <CanonicalFeltSurface />.
 *   2. Publish their felt geometry/subtitle data.
 *
 * Safe to call outside a provider — returns a stable no-op API with
 * `shellOwnsFelt === false`, matching today's behavior.
 */
export function useShellFeltContext(): ShellFeltContextApi {
  const ctx = useContext(ShellFeltContext);
  return ctx ?? NO_OP_API;
}

const NO_OP_API: ShellFeltContextApi = {
  publish: () => {},
  shellOwnsFelt: false,
  current: null,
};

/**
 * Imperative publish helper for surfaces — wraps `useEffect` so the
 * published snapshot tracks the surface's render props and clears on
 * unmount. Suppresses publish entirely when the flag is OFF so the
 * provider state never churns on legacy paths.
 */
export function usePublishShellFelt(value: ShellFeltContextValue | null): void {
  const ctx = useShellFeltContext();
  useEffect(() => {
    if (!ctx.shellOwnsFelt) return;
    ctx.publish(value);
    return () => {
      ctx.publish(null);
    };
    // We intentionally re-publish on any field change; shallow guard in
    // the provider absorbs idempotent calls.
  }, [ctx, JSON.stringify(value)]);
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
      const nodes = document.querySelectorAll('[data-canonical-felt-surface]');
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
      } else if (nodes.length <= 1 && lastWarnCount !== -1) {
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
  const ctx = useShellFeltContext();
  const published = ctx.current;

  const gameKind: CanonicalFeltGameKind =
    published?.gameKind ?? initialGameKind ?? 'holm-game';
  const anteAmount = published?.anteAmount ?? initialAnteAmount;
  const isWaitingPhase = published?.isWaitingPhase ?? initialIsWaitingPhase;

  // DEV-only, warn-only invariant — never throws.
  useShellFeltInvariant();

  return (
    <div
      data-canonical-shell-felt-host=""
      data-canonical-felt-owner="shell-owned-felt-host"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
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
