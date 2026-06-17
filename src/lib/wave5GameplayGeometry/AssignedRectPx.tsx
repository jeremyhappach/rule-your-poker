/**
 * Wave 6A — AssignedRectPx context + AssignedRectFitter.
 *
 * Carries the anchored stage's assigned rect (in CSS pixels) from the
 * anchored slot wrapper down to the renderer subtree, and provides a
 * generic "fit my natural rendered bounds into the assigned rect" wrapper
 * that gives any anchored stage Wave 6A size-ownership without rewriting
 * its internal layout pipeline.
 *
 * Strategy:
 *   - `AssignedRectPxProvider` exposes { widthPx, heightPx } to descendants.
 *   - `AssignedRectFitter` measures its inner content via ResizeObserver and
 *     applies `transform: scale(k)` so rendered bounds track the assigned
 *     rect (within epsilon, modulo the content's intrinsic aspect).
 *   - `useIsRectDriven()` lets descendants suppress device-size branches
 *     while they're inside a fitter (so isTablet bumps don't double-scale).
 *
 * Pure presentational. No business logic. No new providers in Wave 5D.
 */

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AssignedRectPxValue {
  widthPx: number;
  heightPx: number;
}

const AssignedRectPxContext = createContext<AssignedRectPxValue | null>(null);
const RectDrivenContext = createContext<boolean>(false);

export function AssignedRectPxProvider({
  value,
  children,
}: {
  value: AssignedRectPxValue;
  children: ReactNode;
}) {
  return (
    <AssignedRectPxContext.Provider value={value}>
      {children}
    </AssignedRectPxContext.Provider>
  );
}

export function useAssignedRectPx(): AssignedRectPxValue | null {
  return useContext(AssignedRectPxContext);
}

export function useIsRectDriven(): boolean {
  return useContext(RectDrivenContext);
}

/**
 * Wraps children, measures their natural rendered bounds at scale=1, and
 * applies a uniform `transform: scale(k)` so the rendered content fits
 * the assigned rect while preserving the renderer's intrinsic aspect.
 *
 * Inside this wrapper, `useIsRectDriven()` returns true so descendants
 * can suppress device-size bumps that would otherwise double-scale.
 */
export function AssignedRectFitter({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "start";
}) {
  const rect = useAssignedRectPx();
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use offset bounds (pre-transform) so we measure intrinsic size.
        const target = entry.target as HTMLElement;
        const w = target.offsetWidth;
        const h = target.offsetHeight;
        if (w > 0 && h > 0) {
          setNatural((prev) =>
            prev && prev.w === w && prev.h === h ? prev : { w, h },
          );
        }
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (!rect || !natural) return 1;
    if (rect.widthPx <= 0 || rect.heightPx <= 0) return 1;
    if (natural.w <= 0 || natural.h <= 0) return 1;
    return Math.min(rect.widthPx / natural.w, rect.heightPx / natural.h);
  }, [rect, natural]);

  // When we don't yet know the rect, just render naturally (no-op).
  if (!rect || rect.widthPx <= 0 || rect.heightPx <= 0) {
    return (
      <RectDrivenContext.Provider value={false}>
        <div ref={innerRef} style={{ display: "inline-flex" }}>
          {children}
        </div>
      </RectDrivenContext.Provider>
    );
  }

  return (
    <RectDrivenContext.Provider value={true}>
      <div
        data-rect-fitter="true"
        style={{
          width: rect.widthPx,
          height: rect.heightPx,
          display: "flex",
          alignItems: align === "center" ? "center" : "flex-start",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        <div
          ref={innerRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            display: "inline-flex",
            // Avoid first-frame flash before natural is measured.
            visibility: natural ? "visible" : "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </RectDrivenContext.Provider>
  );
}
