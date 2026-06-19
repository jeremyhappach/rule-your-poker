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
 * This module is a real DOM + context provider. With no consumers it is
 * runtime-inert (empty layers, pointer-events: none). Migrating an
 * offender is a one-file change at the offender's render site.
 */

import {
  createContext,
  useContext,
  useEffect,
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

const SHELL_OVERLAY_Z: Record<ShellOverlaySlotName, number> = {
  slot: 78,
  settlement: 83,
  transient: 85,
};

interface ShellOverlayContextValue {
  /** Returns the DOM node for `name`, or null until the layer has mounted. */
  getTarget: (name: ShellOverlaySlotName) => HTMLElement | null;
  /** Reactive subscription — increments when any target mounts. */
  version: number;
}

const ShellOverlayContext = createContext<ShellOverlayContextValue | null>(null);

export interface ShellOverlayMountsProps {
  /** Optional gameId stamped onto mount nodes for diagnostics. */
  gameId?: string | null;
}

/**
 * Mounts the canonical shell overlay layers. Must be rendered inside
 * `PersistentTableShell`'s shell-root, AFTER ChipTransportRuntime so
 * the layer ordering matches the z-band documented above.
 *
 * Wraps `children` with the portal context so descendants can call
 * `useShellOverlayPortal('transient' | ...)`.
 */
export function ShellOverlayMountsProvider({
  gameId,
  children,
}: ShellOverlayMountsProps & { children: ReactNode }) {
  const targetsRef = useRef<Partial<Record<ShellOverlaySlotName, HTMLElement | null>>>({});
  const [version, setVersion] = useState(0);

  const setRef = (name: ShellOverlaySlotName) => (el: HTMLElement | null) => {
    if (targetsRef.current[name] === el) return;
    targetsRef.current[name] = el;
    // bump version so subscribers re-render once the DOM target exists
    setVersion((v) => v + 1);
  };

  const value: ShellOverlayContextValue = {
    getTarget: (name) => targetsRef.current[name] ?? null,
    version,
  };

  return (
    <ShellOverlayContext.Provider value={value}>
      {/* Render layers FIRST so they exist in the DOM at the shell-root
          level; children that portal into them resolve on the next render
          after `version` increments. */}
      {SHELL_OVERLAY_SLOTS.map((name) => (
        <div
          key={name}
          ref={setRef(name)}
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
      {children}
    </ShellOverlayContext.Provider>
  );
}

/**
 * Returns a `portal(node)` helper for the named shell overlay layer.
 * Until the shell layer DOM is available (first render), `portal(node)`
 * returns null so callers can render unconditionally without flashing.
 *
 * Usage:
 *   const portal = useShellOverlayPortal('transient');
 *   return portal(<MyOverSeatBadge ... />);
 *
 * If used outside a `ShellOverlayMountsProvider`, returns a no-op
 * portal that yields null — callers degrade safely (the artifact
 * simply doesn't render) rather than crashing.
 */
export function useShellOverlayPortal(name: ShellOverlaySlotName) {
  const ctx = useContext(ShellOverlayContext);
  return (node: ReactNode): ReactNode => {
    if (!ctx) return null;
    const target = ctx.getTarget(name);
    if (!target) return null;
    return createPortal(node, target);
  };
}

/**
 * Optional: returns the raw DOM node for direct (non-React) consumers
 * (geometry probes, debug pills). Prefer `useShellOverlayPortal` for
 * rendering.
 */
export function useShellOverlayTarget(name: ShellOverlaySlotName): HTMLElement | null {
  const ctx = useContext(ShellOverlayContext);
  // Touch version so React re-renders when target mounts.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _v = ctx?.version ?? 0;
  return ctx?.getTarget(name) ?? null;
}

/**
 * Back-compat shim: prior callers (none in production tree today) used
 * `<ShellOverlayMounts gameId={...} />` as a skeleton marker. The real
 * implementation is `ShellOverlayMountsProvider`. This shim renders the
 * provider with no children so the symbol keeps working if imported.
 */
export function ShellOverlayMounts(props: ShellOverlayMountsProps) {
  return <ShellOverlayMountsProvider {...props}>{null}</ShellOverlayMountsProvider>;
}
