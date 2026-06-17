/**
 * ShellOwnedFeltHost — canonical, unconditional shell-owned felt.
 *
 * Architectural invariant (no flag, no registry, no opt-in):
 * the canonical felt is mounted ONCE by `PersistentTableShell` for the
 * entire session lifecycle and survives every phase boundary. Game
 * surfaces publish their felt context via `usePublishShellFelt`; they
 * never render felt themselves.
 *
 * Prior gates (`isShellOwnedFeltEnabled`, `POKER_SHELL_FELTLESS_FAMILIES`,
 * `feltOwnership` props, `?poker_shell_cutover=` overrides) have been
 * deleted. `shellOwnsFelt` is always `true`.
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
import { Wave5ViewportOverlay } from '@/lib/wave5GameplayGeometry/Wave5ViewportOverlay';
import { Wave5GridOverlay } from '@/lib/wave5GameplayGeometry/Wave5GridOverlay';
import { Wave5SeatReserveOverlay } from '@/lib/wave5GameplayGeometry/Wave5SeatReserveOverlay';
import { Wave5AnchoredProbeOverlay } from '@/lib/wave5GameplayGeometry/Wave5AnchoredProbeOverlay';
import { Wave5OversizedProbeOverlay } from '@/lib/wave5GameplayGeometry/Wave5OversizedProbeOverlay';

// Re-export so non-shell call sites can reference the type without
// importing from the canonical felt module directly (preserves the
// "only shell files import CanonicalFeltSurface" invariant).
export type { CanonicalFeltGameKind };

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
  /**
   * Always `true`. Retained on the type for legacy call-site readability;
   * never branch on it — there is no "self-owned" code path anymore.
   */
  shellOwnsFelt: true;
}

const ShellFeltApiContext = createContext<ShellFeltApi | null>(null);
const ShellFeltStateContext = createContext<ShellFeltContextValue | null>(null);

export interface ShellFeltContextProviderProps {
  children: ReactNode;
}

export function ShellFeltContextProvider({ children }: ShellFeltContextProviderProps) {
  const [current, setCurrent] = useState<ShellFeltContextValue | null>(null);

  const publish = useCallback((value: ShellFeltContextValue | null) => {
    setCurrent((prev) => (shallowFeltEqual(prev, value) ? prev : value));
  }, []);

  const api = useMemo<ShellFeltApi>(
    () => ({ publish, shellOwnsFelt: true }),
    [publish],
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

export interface ShellFeltContextApi extends ShellFeltApi {
  /** Latest snapshot. Reading this subscribes the caller to felt-state re-renders. */
  current: ShellFeltContextValue | null;
}

const NO_OP_API: ShellFeltApi = {
  publish: () => {},
  shellOwnsFelt: true,
};

/**
 * Hook for gameplay surfaces. Returns the STABLE api plus a `current`
 * snapshot. Most publishers should ignore `current` and only call
 * `publish(...)`.
 *
 * `shellOwnsFelt` on the returned object is always `true`. Do not branch
 * on it — local felt rendering is forbidden.
 */
export function useShellFeltContext(): ShellFeltContextApi {
  const api = useContext(ShellFeltApiContext) ?? NO_OP_API;
  const current = useContext(ShellFeltStateContext);
  return useMemo(() => ({ ...api, current }), [api, current]);
}

function useShellFeltState(): ShellFeltContextValue | null {
  return useContext(ShellFeltStateContext);
}

/**
 * Imperative publish helper. Depends only on the STABLE api, so the
 * effect re-fires only when the published value itself changes.
 */
export function usePublishShellFelt(value: ShellFeltContextValue | null): void {
  const api = useContext(ShellFeltApiContext) ?? NO_OP_API;
  useEffect(() => {
    api.publish(value);
    return () => {
      api.publish(null);
    };
  }, [api, JSON.stringify(value)]);
}

// ---------------------------------------------------------------------------
// Single-felt invariant — DEV-only, warn-only.
// ---------------------------------------------------------------------------

export function useShellFeltInvariant(): void {
  useEffect(() => {
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

export function ShellOwnedFeltHost({
  initialGameKind = null,
  initialAnteAmount = 0,
  initialIsWaitingPhase = true,
}: ShellOwnedFeltHostProps) {
  const published = useShellFeltState();

  // Sticky last-non-null snapshot. Surfaces unmount/remount across
  // phase boundaries; each cleanup momentarily publishes `null` before
  // the next surface's mount effect re-publishes. Without stickiness,
  // those one-frame nulls would collapse the felt back to the initial
  // waiting state and visibly blink. The shell felt MUST stay continuous.
  const stickyRef = useRef<ShellFeltContextValue | null>(null);
  if (published) {
    stickyRef.current = published;
  }
  const effective = published ?? stickyRef.current;

  // No fake fallback: when no surface has published and no initial
  // kind is supplied, render the canonical felt geometry with NO
  // game-name plate (bootstrap dealer-selection neutrality).
  const gameKind: CanonicalFeltGameKind | null =
    effective?.gameKind ?? initialGameKind ?? null;
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

  useShellFeltInvariant();

  return (
    <div
      data-canonical-shell-felt-host=""
      data-canonical-felt-owner="shell-owned-felt-host"
      data-shell-felt-mounted="true"
      data-shell-felt-context={JSON.stringify(hostTrace)}
      aria-hidden="true"
      style={{
        // STRUCTURAL play/HUD boundary enforcement.
        //
        // The host wrapper is constrained to the GAMEPLAY REGION only
        // (`--shell-play-h`), not the full row-2 (play + HUD). This
        // means the felt physically cannot render into HUD territory:
        // anything past the bottom of this box is clipped by
        // `overflow: hidden`. The play/HUD boundary is therefore a
        // hard structural edge, not a calculation we have to keep in
        // sync with `--shell-hud-h`.
        //
        // DO NOT change to `inset: 0` — that would re-introduce the
        // boundary violation where the felt visibly leaks behind the
        // announcement rail / tabs.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--shell-play-h)',
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        data-canonical-shell-felt-frame=""
        data-canonical-shell-felt-geometry="ellipse"
        style={{
          position: 'absolute',
          left: '50%',
          // Contract B (canonical, restored 2026-06-01): shell still
          // owns the play region (`--shell-play-h`), but the felt is
          // ASPECT-CAPPED so it cannot stretch into a vertical oval
          // when the play region is taller than the felt's natural
          // shape. Target aspect ≈ 1.09 W/H (the pre-May-31 geometry
          // that was approved). Width is unchanged; height is the
          // smaller of (a) the play region and (b) width / 1.09.
          //
          // Alignment: anchor to the TOP of the host (which is the
          // top of the gameplay region). Gameplay artifacts (chip
          // stacks, crib, score rails) are positioned in the upper
          // portion of the gameplay coordinate space, so the felt
          // must rise to meet them. Any leftover vertical space
          // appears as a single gap BELOW the felt, between the
          // felt's bottom edge and the play/HUD boundary — it never
          // leaks into HUD territory (host has overflow:hidden) and
          // never pushes the HUD downward.
          // SAFE-AREA contract: the felt is positioned inside the
          // play region with `top: var(--play-top-safe-area)`. The
          // play region itself is sized `--shell-play-h-base + top +
          // bottom`, so the felt sits ABOVE the bottom safe area and
          // BELOW the top safe area. The felt's own bounding rect,
          // aspect ratio, and internal geometry are pixel-identical
          // at every (top, bottom) value pair.
          top: 'var(--play-top-safe-area, 0px)',
          height: 'var(--shell-felt-h)',
          width: 'var(--shell-felt-w)',
          minWidth: 300,
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
        <Wave5ViewportOverlay />
        <Wave5SeatReserveOverlay />
        <Wave5AnchoredProbeOverlay />
        <Wave5OversizedProbeOverlay />
      </div>
    </div>
  );
}

/**
 * Derive the canonical felt game-kind from a session `game.game_type` string.
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
    case '3-5-7':
    case '3-5-7-game':
    case '357':
      return 'three-five-seven';
    default:
      return null;
  }
}
