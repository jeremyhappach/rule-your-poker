/**
 * Wave 5D.1 — Internal Content Contract
 * useChildrenBoundsContract
 *
 * Enforces:
 *   compositeChildrenBounds  ⊆  assignedRect
 *
 * for an anchored stage. Measures each registered child ref via
 * getBoundingClientRect, projects into felt-local vmin using the same
 * `[data-canonical-felt-surface]` origin as `useDomBoundsContract`, unions
 * the rects, and compares to the stage's assignedRect. Emits
 * `wave5:children_exceed_stage` when the composite extends past the stage
 * on any side beyond the sub-pixel epsilon.
 *
 * No clipping. No overflow:hidden. No auto-resize. The hook only OBSERVES.
 * Violations must be fixed by deriving child sizes from the stage rect
 * (see Wave5 Internal Content Contract).
 */

import { useEffect, useRef } from "react";
import {
  emitChildrenExceedStage,
  computeOverflow,
  overflowExceedsEpsilon,
  type ContractRect,
  type ContractOverflow,
} from "./contractTelemetry";

const FELT_SURFACE_SELECTOR = "[data-canonical-felt-surface]";

function getFeltOrigin(): { left: number; top: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(FELT_SURFACE_SELECTOR);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top };
}

export interface ChildContractTarget {
  id: string;
  ref: React.RefObject<HTMLElement | null>;
}

export interface UseChildrenBoundsContractOptions {
  artifactId: string;
  /** Stage rect (felt-local vmin) — same coordinate system as availableGameplayViewport. */
  assignedRect: ContractRect;
  /** 1 vmin in px. */
  vminInPx: number;
  /** Children to measure. Missing refs are skipped. */
  children: ReadonlyArray<ChildContractTarget>;
  /** When false the hook is inert. */
  enabled?: boolean;
}

function unionRect(rects: ContractRect[]): ContractRect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rects) {
    if (r.x < x0) x0 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.x + r.width > x1) x1 = r.x + r.width;
    if (r.y + r.height > y1) y1 = r.y + r.height;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function useChildrenBoundsContract(
  opts: UseChildrenBoundsContractOptions,
): void {
  const { artifactId, assignedRect, vminInPx, children, enabled = true } = opts;

  const arKey = `${assignedRect.x}|${assignedRect.y}|${assignedRect.width}|${assignedRect.height}`;
  const childIdsKey = children.map((c) => c.id).join(",");
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (vminInPx <= 0) return;

    let raf = 0;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const origin = getFeltOrigin();
        if (!origin) return;
        const childRects: Array<{ id: string; rect: ContractRect }> = [];
        for (const c of children) {
          const n = c.ref.current;
          if (!n) continue;
          const r = n.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          childRects.push({
            id: c.id,
            rect: {
              x: (r.left - origin.left) / vminInPx,
              y: (r.top - origin.top) / vminInPx,
              width: r.width / vminInPx,
              height: r.height / vminInPx,
            },
          });
        }
        if (childRects.length === 0) return;
        const composite = unionRect(childRects.map((c) => c.rect));
        if (!composite) return;

        const overflow: ContractOverflow = computeOverflow(composite, assignedRect);
        const sig =
          `${overflow.top.toFixed(2)}|${overflow.right.toFixed(2)}|` +
          `${overflow.bottom.toFixed(2)}|${overflow.left.toFixed(2)}`;

        if (overflowExceedsEpsilon(overflow)) {
          if (lastSigRef.current === sig) return;
          lastSigRef.current = sig;
          emitChildrenExceedStage({
            artifactId,
            assignedRect,
            compositeChildrenBounds: composite,
            childRects,
            overflow,
            timestamp: Date.now(),
          });
        } else {
          lastSigRef.current = null;
        }
      });
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      for (const c of children) {
        if (c.ref.current) ro.observe(c.ref.current);
      }
      const surface = document.querySelector(FELT_SURFACE_SELECTOR);
      if (surface) ro.observe(surface);
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
  }, [enabled, artifactId, vminInPx, arKey, childIdsKey]);
}
