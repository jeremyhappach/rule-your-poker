/**
 * Wave5AnchoredProbeOverlay — TEMPORARY synthetic test descriptor.
 *
 * Mounts a single anchored ArtifactDescriptor through the resolver to
 * visually verify Wave 5D Phase 2's anchored composeMode end-to-end:
 *
 *   anchorX 0.5, anchorY 0.5, anchorOrigin 'center',
 *   widthPct 0.40, aspectRatio 2 (height = width / 2)
 *
 * Renders the resolved rect (felt-vmin) over the canonical felt as a
 * dashed box labelled `ANCHORED PROBE`. If the box visibly tracks the
 * center of the gameplay viewport across orientations and the moment
 * you change anchorX/anchorY in the source it moves with no other
 * artifact affected, anchored mode is correctly wired.
 *
 * Contract:
 *  - pointer-events: none
 *  - shell-owned toggle only (localStorage `ptp_wave5_anchored_probe`
 *    or URL `?wave5_anchored_probe=1`)
 *  - DELETE once gameplay descriptors begin migrating to anchored.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveAvailableGameplayViewport,
  resolveLayout,
  useLiveGeometryConstraints,
  vmin,
  type ArtifactDescriptor,
} from "@/lib/wave4LayoutResolver";
import { useDomBoundsContract } from "./useDomBoundsContract";
import { HIDE_DEBUG_UI } from "@/lib/debugUIVisibility";

const STORAGE_KEY = "ptp_wave5_anchored_probe";
const EVENT_NAME = "ptp:wave5-anchored-probe-changed";

function readFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("wave5_anchored_probe");
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setFlag(next: boolean): void {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* noop */
  }
}

function useEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readFlag());
  useEffect(() => {
    const handler = () => setEnabled(readFlag());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return enabled;
}

// Synthetic descriptor — the only place an anchored descriptor exists today.
const PROBE_DESCRIPTOR: ArtifactDescriptor = {
  id: "wave5.anchoredProbe",
  owner: "wave5.diagnostic",
  composeMode: "anchored",
  // Required by the type but ignored by the anchored stage:
  preferredSize: { width: vmin(0), height: vmin(0) },
  minimumSize: { width: vmin(0), height: vmin(0) },
  priority: 0,
  collapsePriority: "never",
  // Anchored fields:
  anchorX: 0.5,
  anchorY: 0.5,
  anchorOrigin: "center",
  widthPct: 0.4,
  aspectRatio: 2,
};

export function Wave5AnchoredProbeOverlay() {
  const enabled = useEnabled();
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const ref = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(() => {
    if (!geometry) return null;
    return resolveLayout([PROBE_DESCRIPTOR], geometry);
  }, [geometry]);

  const viewport = useMemo(() => {
    if (!geometry) return null;
    return deriveAvailableGameplayViewport(geometry).viewport;
  }, [geometry]);

  const placement = layout?.placements.find((p) => p.id === PROBE_DESCRIPTOR.id);
  const visible = !!placement && placement.visible;

  const assignedRect = useMemo(() => {
    if (!placement) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: placement.rect.x.value,
      y: placement.rect.y.value,
      width: placement.rect.width.value,
      height: placement.rect.height.value,
    };
  }, [placement]);

  const viewportRect = useMemo(() => {
    if (!viewport) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: viewport.rect.x.value,
      y: viewport.rect.y.value,
      width: viewport.rect.width.value,
      height: viewport.rect.height.value,
    };
  }, [viewport]);

  useDomBoundsContract(ref, {
    artifactId: PROBE_DESCRIPTOR.id,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled: enabled && visible && vminInPx > 0,
  });

  if (!enabled || !layout || vminInPx <= 0) return null;
  if (!placement || !visible) return null;

  const r = placement.rect;
  const x = r.x.value * vminInPx;
  const y = r.y.value * vminInPx;
  const w = r.width.value * vminInPx;
  const h = r.height.value * vminInPx;
  if (w <= 0 || h <= 0) return null;

  const outside = layout.faults.some(
    (f) => f.code === "anchored_outside_viewport",
  );

  return (
    <div
      ref={ref}
      data-wave5-anchored-probe=""
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 7,
        background: outside
          ? "rgba(248, 113, 113, 0.18)"
          : "rgba(132, 204, 22, 0.14)",
        border: outside
          ? "1.5px dashed rgba(248,113,113,0.95)"
          : "1.5px dashed rgba(132,204,22,0.95)",
        boxSizing: "border-box",
        borderRadius: 3,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 4,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 10,
          lineHeight: 1.15,
          color: "rgba(255,255,255,0.95)",
          textShadow: "0 1px 2px rgba(0,0,0,0.85)",
          letterSpacing: 0.3,
          whiteSpace: "pre",
        }}
      >
        {`ANCHORED PROBE${outside ? " · OUTSIDE" : ""}
anchor 0.50 / 0.50 center
w% 0.40 · aspect 2`}
      </div>
    </div>
  );
}

export function Wave5AnchoredProbeToggle() {
  const enabled = useEnabled();
  if (HIDE_DEBUG_UI) return null;
  return (
    <button
      type="button"
      onClick={() => setFlag(!enabled)}
      title={
        enabled
          ? "Hide Wave 5D anchored probe descriptor"
          : "Show Wave 5D anchored probe descriptor"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(132,204,22,0.65)",
        background: enabled
          ? "rgba(132,204,22,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#0a1500" : "rgba(217,249,157,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 ANCHORED
    </button>
  );
}
