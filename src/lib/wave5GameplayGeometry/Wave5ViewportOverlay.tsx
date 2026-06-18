/**
 * Wave5ViewportOverlay — TEMPORARY visual diagnostic for Wave 5D Phase 1.
 *
 * Renders exactly `ResolvedLayout.geometry.availableGameplayViewport`
 * over the canonical shell felt so we can visually smoke the derived
 * gameplay canvas (announcement rail → availableGameplayViewport →
 * HUD/tab rail) across phones / iPads, waiting / gameplay / observer.
 *
 * Contract:
 *  - pointer-events: none
 *  - z-index between felt background and gameplay artifacts
 *  - shell-owned toggle only (localStorage `ptp_wave5_viewport_overlay`
 *    or URL `?wave5_viewport_overlay=1`)
 *  - DELETE after the viewport shape is trusted; telemetry stays.
 *
 * Companion <Wave5ViewportOverlayToggle/> pill lives in the DebugTray.
 */

import { useEffect, useState } from "react";
import {
  deriveAvailableGameplayViewport,
  useLiveGeometryConstraints,
} from "@/lib/wave4LayoutResolver";
import { useHideDebugUI } from "@/lib/debugUIVisibility";

const STORAGE_KEY = "ptp_wave5_viewport_overlay";
const EVENT_NAME = "ptp:wave5-viewport-overlay-changed";

function readFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("wave5_viewport_overlay");
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
  } catch { /* */ }
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

/**
 * Overlay node — mount inside the shell felt frame (coord space = feltBounds).
 * Renders absolutely positioned over felt, below gameplay artifacts.
 */
export function Wave5ViewportOverlay() {
  const enabled = useEnabled();
  const { geometry, vminInPx } = useLiveGeometryConstraints();

  if (!enabled || !geometry || vminInPx <= 0) return null;

  const { viewport } = deriveAvailableGameplayViewport(geometry);
  const r = viewport.rect;
  // vmin -> px (frame is felt-sized so this maps 1:1 onto the frame).
  const x = r.x.value * vminInPx;
  const y = r.y.value * vminInPx;
  const w = r.width.value * vminInPx;
  const h = r.height.value * vminInPx;

  if (w <= 0 || h <= 0) return null;

  return (
    <div
      data-wave5-viewport-overlay=""
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: "none",
        // Above felt background (z=0) and bridge image, below gameplay
        // artifacts and the game-name plate (z=20).
        zIndex: 5,
        background: "rgba(56, 189, 248, 0.08)", // sky-400 @ 8%
        border: "1.5px dashed rgba(56, 189, 248, 0.9)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
        boxSizing: "border-box",
        borderRadius: 2,
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
          textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          letterSpacing: 0.2,
          whiteSpace: "pre",
        }}
      >
        {`availableGameplayViewport
x ${r.x.value.toFixed(1)} y ${r.y.value.toFixed(1)}
w ${r.width.value.toFixed(1)} h ${r.height.value.toFixed(1)}`}
      </div>
    </div>
  );
}

/**
 * DebugTray pill — shell-owned toggle. Visible only when debug UI is shown.
 */
export function Wave5ViewportOverlayToggle() {
  const enabled = useEnabled();
  if (useHideDebugUI()) return null;
  return (
    <button
      type="button"
      onClick={() => setFlag(!enabled)}
      title={
        enabled
          ? "Hide Wave 5 availableGameplayViewport overlay"
          : "Show Wave 5 availableGameplayViewport overlay"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(56,189,248,0.6)",
        background: enabled
          ? "rgba(56,189,248,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#001018" : "rgba(186,230,253,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 VIEWPORT
    </button>
  );
}
