/**
 * Wave 5 — Gameplay Coordinate Grid Overlay (W5 GRID).
 *
 * Permanent debug ruler for the `availableGameplayViewport` coordinate
 * system. NOT a layout tool, NOT a reserve overlay — just a visualization
 * of the (anchorX, anchorY) plane that anchored gameplay artifacts are
 * placed against.
 *
 * Contract:
 *  - Coordinates are expressed in viewport space (0..1 of viewport w/h),
 *    NOT felt space.
 *  - Scales automatically with viewport changes (uses live geometry).
 *  - Ignores seat reserves & gameplay artifacts.
 *  - pointer-events:none, sits beneath gameplay artifacts.
 *  - Shell-owned toggle (URL `?wave5_grid=1` or localStorage
 *    `ptp_wave5_grid`).
 */

import { useEffect, useState } from "react";
import {
  deriveAvailableGameplayViewport,
  useLiveGeometryConstraints,
} from "@/lib/wave4LayoutResolver";
import { useDebugPillEnabled } from "@/lib/debugTray/debugPillsStore";

const STORAGE_KEY = "ptp_wave5_grid";
const EVENT_NAME = "ptp:wave5-grid-changed";
const URL_PARAM = "wave5_grid";

function readFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get(URL_PARAM);
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

const TICKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

const COLOR_FAINT = "rgba(186, 230, 253, 0.35)"; // sky-200 @ 35%
const COLOR_AXIS = "rgba(56, 189, 248, 0.85)";   // sky-400
const COLOR_CROSS = "rgba(250, 204, 21, 0.95)";  // yellow-400
const COLOR_LABEL = "rgba(255, 255, 255, 0.92)";

const LABEL_STYLE: React.CSSProperties = {
  position: "absolute",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 9,
  lineHeight: 1,
  color: COLOR_LABEL,
  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
  pointerEvents: "none",
  letterSpacing: 0.2,
};

export function Wave5GridOverlay() {
  const enabled = useEnabled();
  const { geometry, vminInPx } = useLiveGeometryConstraints();

  if (!enabled || !geometry || vminInPx <= 0) return null;

  const { viewport } = deriveAvailableGameplayViewport(geometry);
  const r = viewport.rect;
  const x = r.x.value * vminInPx;
  const y = r.y.value * vminInPx;
  const w = r.width.value * vminInPx;
  const h = r.height.value * vminInPx;
  if (w <= 0 || h <= 0) return null;

  return (
    <div
      data-wave5-grid-overlay=""
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 6, // just above viewport overlay (5), beneath gameplay (10+)
      }}
    >
      {/* Vertical center guideline (anchorX = 0.50) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: `1px solid ${COLOR_AXIS}`,
          transform: "translateX(-0.5px)",
        }}
      />
      <div style={{ ...LABEL_STYLE, top: 2, left: "50%", transform: "translateX(-50%)", color: COLOR_AXIS, fontWeight: 600 }}>
        0.50
      </div>

      {/* Horizontal ticks at anchorY = 0.10 .. 0.90 (span ~10% width, centered on x=0.50) */}
      {TICKS.map((t) => {
        const isMid = t === 0.5;
        return (
          <div key={`hy-${t}`}>
            <div
              style={{
                position: "absolute",
                top: `${t * 100}%`,
                left: "45%",
                width: "10%",
                height: 0,
                borderTop: `1px dashed ${isMid ? COLOR_CROSS : COLOR_FAINT}`,
                transform: "translateY(-0.5px)",
              }}
            />
            <div
              style={{
                ...LABEL_STYLE,
                top: `${t * 100}%`,
                left: 2,
                transform: "translateY(-50%)",
                color: isMid ? COLOR_CROSS : COLOR_LABEL,
                fontWeight: isMid ? 700 : 400,
              }}
            >
              {Math.round(t * 100)}
            </div>
          </div>
        );
      })}

      {/* Vertical ticks at anchorX = 0.10 .. 0.90 (span ~10% height, centered on y=0.50) */}
      {TICKS.map((t) => {
        const isMid = t === 0.5;
        return (
          <div key={`vx-${t}`}>
            <div
              style={{
                position: "absolute",
                left: `${t * 100}%`,
                top: "45%",
                height: "10%",
                width: 0,
                borderLeft: `1px dashed ${isMid ? COLOR_CROSS : COLOR_FAINT}`,
                transform: "translateX(-0.5px)",
              }}
            />
            <div
              style={{
                ...LABEL_STYLE,
                left: `${t * 100}%`,
                bottom: 2,
                transform: "translateX(-50%)",
                color: isMid ? COLOR_CROSS : COLOR_LABEL,
                fontWeight: isMid ? 700 : 400,
              }}
            >
              {t.toFixed(1)}
            </div>
          </div>
        );
      })}

      {/* Brighter crosshair at (0.50, 0.50) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1.5px solid ${COLOR_CROSS}`,
          boxShadow: "0 0 4px rgba(0,0,0,0.6)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 22,
          height: 0,
          transform: "translate(-50%, -50%)",
          borderTop: `1px solid ${COLOR_CROSS}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 22,
          transform: "translate(-50%, -50%)",
          borderLeft: `1px solid ${COLOR_CROSS}`,
        }}
      />
    </div>
  );
}

export function Wave5GridOverlayToggle() {
  const enabled = useEnabled();
  const pillEnabled = useDebugPillEnabled('w5Grid');
  if (!pillEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => setFlag(!enabled)}
      title={
        enabled
          ? "Hide Wave 5 gameplay coordinate grid"
          : "Show Wave 5 gameplay coordinate grid"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(250,204,21,0.6)",
        background: enabled
          ? "rgba(250,204,21,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#1a1300" : "rgba(254,240,138,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 GRID
    </button>
  );
}
