/**
 * Wave5SeatReserveOverlay — TEMPORARY visual diagnostic.
 *
 * Renders the canonical seat bounds (per-seat namePlate rects from
 * `geometry.seatRing.seatAnchors`) expanded by a small visual padding,
 * so we can eyeball `availableGameplayViewport ∩ seatReserve` across
 * portrait / landscape / observer / 2p / 4p / 6p.
 *
 * Contract:
 *  - PURELY diagnostic. Resolver does NOT subtract seat reserves from
 *    the gameplay viewport. See Phase 1 sign-off discussion in chat.
 *  - pointer-events: none
 *  - shell-owned toggle only (localStorage `ptp_wave5_seat_reserve_overlay`
 *    or URL `?wave5_seat_reserve_overlay=1`)
 *  - DELETE once we have evidence (or absence) of gameplay ↔ seat collisions.
 */

import { useEffect, useState } from "react";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver";
import { HIDE_DEBUG_UI } from "@/lib/debugUIVisibility";

const STORAGE_KEY = "ptp_wave5_seat_reserve_overlay";
const EVENT_NAME = "ptp:wave5-seat-reserve-overlay-changed";
const PAD_VMIN = 1.25; // visual padding around each seat namePlate

function readFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("wave5_seat_reserve_overlay");
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

export function Wave5SeatReserveOverlay() {
  const enabled = useEnabled();
  const { geometry, vminInPx } = useLiveGeometryConstraints();

  if (!enabled || !geometry || vminInPx <= 0) return null;

  const anchors = geometry.seatRing.seatAnchors;
  if (!anchors || anchors.length === 0) return null;

  return (
    <div
      data-wave5-seat-reserve-overlay=""
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 6, // above viewport overlay (5), still below gameplay artifacts
      }}
    >
      {anchors.map((s) => {
        const np = s.namePlate;
        const x = (np.x.value - PAD_VMIN) * vminInPx;
        const y = (np.y.value - PAD_VMIN) * vminInPx;
        const w = (np.width.value + PAD_VMIN * 2) * vminInPx;
        const h = (np.height.value + PAD_VMIN * 2) * vminInPx;
        return (
          <div
            key={s.position}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: h,
              background: "rgba(244, 114, 182, 0.10)", // pink-400 @ 10%
              border: "1.25px dashed rgba(244, 114, 182, 0.95)",
              boxSizing: "border-box",
              borderRadius: 4,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 1,
                left: 3,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 9,
                lineHeight: 1.1,
                color: "rgba(255,255,255,0.95)",
                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                letterSpacing: 0.2,
                whiteSpace: "nowrap",
              }}
            >
              {`seat ${s.position} · ${s.facing}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Wave5SeatReserveOverlayToggle() {
  const enabled = useEnabled();
  if (HIDE_DEBUG_UI) return null;
  return (
    <button
      type="button"
      onClick={() => setFlag(!enabled)}
      title={
        enabled
          ? "Hide Wave 5 seat reserve overlay"
          : "Show Wave 5 seat reserve overlay (diagnostic only — not subtracted)"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(244,114,182,0.6)",
        background: enabled
          ? "rgba(244,114,182,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#1a0010" : "rgba(251,207,232,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 SEAT RES
    </button>
  );
}
