/**
 * ShellOverlayMounts — shell-owned transient overlay layers.
 *
 * Ownership rule:
 *   - The shell creates overlay layers and exposes typed portal targets.
 *   - Gameplay surfaces may request typed presentation via
 *     `useShellOverlayPortal(name)` and portal their nodes in.
 *   - Gameplay surfaces MUST NOT manually mount over-seat transient
 *     artifacts inside the table/seat subtrees — those get trapped under
 *     CanonicalSeatCluster's always-on stacking contexts (name row's
 *     translateX, nameplate backdrop-blur). Use the shell overlay
 *     portals instead.
 *
 * Z-band (stable, shell-controlled):
 *   - Seat clusters / gameplay table content  : z < 80 (inside slot)
 *   - slot           overlay : z = 78         (game-internal reveals
 *                                              that sit BELOW chip
 *                                              transports — e.g.
 *                                              cut-card flip glow)
 *   - ChipTransportRuntime   : z = 80         (PersistentTableShell)
 *   - settlement     overlay : z = 83         (post-resolution chip
 *                                              fan-outs, leg/pot
 *                                              presentations that need
 *                                              to land above chip flight)
 *   - transient      overlay : z = 85         (HighCard reveals, win
 *                                              score badges, generic
 *                                              over-seat presentations)
 *   - CanonicalCelebrationLayer              : z = 90
 *
 * Architecture:
 *   - `ShellOverlayMountsProvider` owns the React context. Wrap it
 *     around any subtree that needs access to portal targets.
 *   - `<ShellOverlayLayers />` renders the actual DOM layers and
 *     registers them with the provider. Mount this once inside the
 *     shell-root at the desired stacking order.
 *   - `useShellOverlayPortal(name)` returns a `portal(node)` helper
 *     for gameplay surfaces to render through.
 *
 * With no consumers, the layers are runtime-inert (empty divs,
 * pointer-events: none). Migrating an offender is a one-file change
 * at the offender's render site.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type ShellOverlaySlotName = 'slot' | 'settlement' | 'transient';

export const SHELL_OVERLAY_SLOTS: readonly ShellOverlaySlotName[] = [
  'slot',
  'settlement',
  'transient',
] as const;

export const SHELL_OVERLAY_Z: Record<ShellOverlaySlotName, number> = {
  slot: 78,
  settlement: 83,
  transient: 85,
};

interface ShellOverlayContextValue {
  registerTarget: (name: ShellOverlaySlotName, el: HTMLElement | null) => void;
  getTarget: (name: ShellOverlaySlotName) => HTMLElement | null;
  /** Bumps when any target mounts/unmounts so consumers re-render. */
  version: number;
}

const ShellOverlayContext = createContext<ShellOverlayContextValue | null>(null);

export interface ShellOverlayMountsProviderProps {
  children: ReactNode;
}

/**
 * Owns the shell overlay portal context. Wrap any subtree that needs
 * either to register layer DOM (`<ShellOverlayLayers />`) or to portal
 * into a layer (`useShellOverlayPortal`).
 */
export function ShellOverlayMountsProvider({ children }: ShellOverlayMountsProviderProps) {
  const targetsRef = useRef<Partial<Record<ShellOverlaySlotName, HTMLElement | null>>>({});
  const [version, setVersion] = useState(0);

  const registerTarget = useCallback(
    (name: ShellOverlaySlotName, el: HTMLElement | null) => {
      if (targetsRef.current[name] === el) return;
      targetsRef.current[name] = el;
      setVersion((v) => v + 1);
    },
    [],
  );

  const getTarget = useCallback(
    (name: ShellOverlaySlotName) => targetsRef.current[name] ?? null,
    [],
  );

  const value = useMemo<ShellOverlayContextValue>(
    () => ({ registerTarget, getTarget, version }),
    [registerTarget, getTarget, version],
  );

  return (
    <ShellOverlayContext.Provider value={value}>
      {children}
    </ShellOverlayContext.Provider>
  );
}

export interface ShellOverlayLayersProps {
  /** Optional gameId stamped onto layer nodes for diagnostics. */
  gameId?: string | null;
}

/**
 * Renders the canonical overlay layer DOM and registers each layer
 * with the surrounding `ShellOverlayMountsProvider`. Mount this once
 * inside `PersistentTableShell`'s shell-root, AFTER ChipTransportRuntime
 * (so z-band ordering reads naturally in DOM source order).
 */
export function ShellOverlayLayers({ gameId }: ShellOverlayLayersProps) {
  const ctx = useContext(ShellOverlayContext);
  return (
    <>
      {SHELL_OVERLAY_SLOTS.map((name) => (
        <div
          key={name}
          ref={(el) => ctx?.registerTarget(name, el)}
          data-shell-overlay={name}
          data-shell-overlay-z={SHELL_OVERLAY_Z[name]}
          data-shell-overlay-game-id={gameId ?? undefined}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: SHELL_OVERLAY_Z[name],
          }}
        />
      ))}
    </>
  );
}

/**
 * Returns a `portal(node)` helper for the named shell overlay layer.
 * Returns null until the layer DOM is available (first render after
 * mount), or when used outside `ShellOverlayMountsProvider`.
 *
 * Usage:
 *   const portal = useShellOverlayPortal('transient');
 *   return portal(<MyOverSeatBadge ... />);
 */
export function useShellOverlayPortal(name: ShellOverlaySlotName) {
  const ctx = useContext(ShellOverlayContext);
  // Touching version keeps callers reactive when the target mounts.
  const _version = ctx?.version ?? 0;
  return (node: ReactNode): ReactNode => {
    if (!ctx) return null;
    void _version;
    const target = ctx.getTarget(name);
    if (!target) return null;
    return createPortal(node, target);
  };
}

/**
 * Raw DOM accessor for non-React consumers (geometry probes, debug
 * pills). Prefer `useShellOverlayPortal` for rendering.
 */
export function useShellOverlayTarget(name: ShellOverlaySlotName): HTMLElement | null {
  const ctx = useContext(ShellOverlayContext);
  const _v = ctx?.version ?? 0;
  void _v;
  return ctx?.getTarget(name) ?? null;
}

/**
 * Back-compat shim. Older callers (none in production tree today) used
 * `<ShellOverlayMounts />` as a skeleton marker. New code should mount
 * `<ShellOverlayMountsProvider>` + `<ShellOverlayLayers />` directly.
 */
export function ShellOverlayMounts({ gameId }: { gameId?: string | null }) {
  return (
    <ShellOverlayMountsProvider>
      <ShellOverlayLayers gameId={gameId} />
    </ShellOverlayMountsProvider>
  );
}
