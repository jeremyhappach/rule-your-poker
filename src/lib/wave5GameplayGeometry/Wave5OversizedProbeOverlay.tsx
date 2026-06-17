/**
 * Wave5OversizedProbeOverlay — TEMPORARY synthetic FAILURE descriptor.
 *
 * Mounts an anchored descriptor that is deliberately too large to fit
 * inside `availableGameplayViewport` so we can prove the Phase 3
 * DOM-bounds contract fires `wave5:contract_violation` with correct
 * overflow values.
 *
 *   anchorX 0.5, anchorY 0.5, anchorOrigin 'center',
 *   widthPct 0.95, aspectRatio 0.25   →  height = width / 0.25 = 3.8w
 *
 * The framework MUST NOT clip, hide, reposition, or shrink. The probe
 * is rendered at its assigned (overflowing) rect verbatim; the contract
 * hook detects the overflow and emits the violation.
 *
 * Contract:
 *  - pointer-events: none
 *  - shell-owned toggle only (localStorage `ptp_wave5_oversized_probe`
 *    or URL `?wave5_oversized_probe=1`)
 *  - DELETE once anchored gameplay artifacts begin migrating.
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

const STORAGE_KEY = "ptp_wave5_oversized_probe";
const EVENT_NAME = "ptp:wave5-oversized-probe-changed";

function readFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("wave5_oversized_probe");
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

const OVERSIZED_DESCRIPTOR: ArtifactDescriptor = {
  id: "wave5.oversizedProbe",
  owner: "wave5.diagnostic",
  composeMode: "anchored",
  preferredSize: { width: vmin(0), height: vmin(0) },
  minimumSize: { width: vmin(0), height: vmin(0) },
  priority: 0,
  collapsePriority: "never",
  anchorX: 0.5,
  anchorY: 0.5,
  anchorOrigin: "center",
  widthPct: 0.95,
  aspectRatio: 0.25, // very tall — guaranteed to overflow
};

export function Wave5OversizedProbeOverlay() {
  const enabled = useEnabled();
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const ref = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(() => {
    if (!geometry) return null;
    return resolveLayout([OVERSIZED_DESCRIPTOR], geometry);
  }, [geometry]);

  const viewport = useMemo(() => {
    if (!geometry) return null;
    return deriveAvailableGameplayViewport(geometry).viewport;
  }, [geometry]);

  const placement = layout?.placements.find(
    (p) => p.id === OVERSIZED_DESCRIPTOR.id,
  );

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
    artifactId: OVERSIZED_DESCRIPTOR.id,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled: enabled && !!placement && placement.visible && vminInPx > 0,
  });

  if (!enabled || !placement || !placement.visible || vminInPx <= 0) {
    return null;
  }

  const x = assignedRect.x * vminInPx;
  const y = assignedRect.y * vminInPx;
  const w = assignedRect.width * vminInPx;
  const h = assignedRect.height * vminInPx;
  if (w <= 0 || h <= 0) return null;

  return (
    <div
      ref={ref}
      data-wave5-oversized-probe=""
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 8,
        background: "rgba(244, 63, 94, 0.16)", // rose-500
        border: "1.5px dashed rgba(244,63,94,0.95)",
        boxSizing: "border-box",
        borderRadius: 3,
        // NO overflow:hidden. NO clip. NO transform. The framework
        // must NOT save the descriptor from itself.
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
        {`OVERSIZED PROBE · contract MUST fail
anchor 0.50 / 0.50 center
w% 0.95 · aspect 0.25`}
      </div>
    </div>
  );
}

export function Wave5OversizedProbeToggle() {
  const enabled = useEnabled();
  if (HIDE_DEBUG_UI) return null;
  return (
    <button
      type="button"
      onClick={() => setFlag(!enabled)}
      title={
        enabled
          ? "Hide Wave 5D oversized contract-violation probe"
          : "Show Wave 5D oversized contract-violation probe"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(244,63,94,0.7)",
        background: enabled
          ? "rgba(244,63,94,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#1a0008" : "rgba(254,205,211,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 OVERSIZED
    </button>
  );
}
