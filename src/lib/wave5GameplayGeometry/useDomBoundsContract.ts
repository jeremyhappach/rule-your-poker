/**
 * Wave 5D — Phase 3
 * useDomBoundsContract — DOM-Bounds Contract Enforcement.
 *
 * For every anchored artifact, attach a ResizeObserver to the rendered
 * root, measure its on-screen bounding box, project into felt-local
 * vmin using the same `[data-canonical-felt-surface]` projection used
 * for `feltBounds` / `availableGameplayViewport`, and compare against
 * the gameplay viewport. Emits `wave5:contract_violation` whenever
 * `renderedBounds ⊄ availableGameplayViewport`.
 *
 * The framework does NOT correct violations:
 *   - no overflow:hidden injection
 *   - no clip
 *   - no auto-shrink
 *   - no auto-reposition
 * If you don't fit, you are wrong.
 *
 * Re-measures on:
 *   - element resize (ResizeObserver)
 *   - felt surface resize
 *   - window resize / orientation change
 *   - assignedRect / viewport changes (effect deps)
 */

import { useEffect, useRef } from "react";
import {
  emitContractViolation,
  computeOverflow,
  overflowExceedsEpsilon,
  type ContractRect,
} from "./contractTelemetry";

interface UseDomBoundsContractOptions {
  artifactId: string;
  /** Resolver-assigned rect in felt-local vmin. */
  assignedRect: ContractRect;
  /** Authoritative gameplay viewport in felt-local vmin. */
  availableGameplayViewport: ContractRect;
  /** 1 vmin in px (same scalar `useLiveGeometryConstraints` returns). */
  vminInPx: number;
  /** When false, the hook is inert (no observer, no emit). */
  enabled?: boolean;
}

const FELT_SURFACE_SELECTOR = "[data-canonical-felt-surface]";

function getFeltOrigin(): { left: number; top: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(FELT_SURFACE_SELECTOR);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top };
}

export function useDomBoundsContract(
  ref: React.RefObject<HTMLElement | null>,
  opts: UseDomBoundsContractOptions,
): void {
  const {
    artifactId,
    assignedRect,
    availableGameplayViewport,
    vminInPx,
    enabled = true,
  } = opts;

  // Serialize rects so effect deps remain primitive.
  const arKey = `${assignedRect.x}|${assignedRect.y}|${assignedRect.width}|${assignedRect.height}`;
  const vpKey = `${availableGameplayViewport.x}|${availableGameplayViewport.y}|${availableGameplayViewport.width}|${availableGameplayViewport.height}`;

  // Avoid re-emitting the same violation on every frame.
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (vminInPx <= 0) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        const origin = getFeltOrigin();
        if (!origin) return;
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;

        const rendered: ContractRect = {
          x: (r.left - origin.left) / vminInPx,
          y: (r.top - origin.top) / vminInPx,
          width: r.width / vminInPx,
          height: r.height / vminInPx,
        };

        const overflow = computeOverflow(rendered, availableGameplayViewport);
        const sig =
          `${overflow.top.toFixed(2)}|${overflow.right.toFixed(2)}|` +
          `${overflow.bottom.toFixed(2)}|${overflow.left.toFixed(2)}`;

        if (overflowExceedsEpsilon(overflow)) {
          if (lastSigRef.current === sig) return;
          lastSigRef.current = sig;
          emitContractViolation({
            artifactId,
            assignedRect,
            renderedBounds: rendered,
            availableGameplayViewport,
            overflow,
            timestamp: Date.now(),
          });
        } else {
          // Cleared — allow the next violation (if any) to re-emit.
          lastSigRef.current = null;
        }
      });
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      const surface = document.querySelector(FELT_SURFACE_SELECTOR);
      if (surface) ro.observe(surface);
      const hud = document.querySelector("[data-canonical-shell-hud-grid]");
      if (hud) ro.observe(hud);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, artifactId, vminInPx, arKey, vpKey]);
}
