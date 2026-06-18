/**
 * Wave 4 — Phase 5A
 * LayoutFaultBadge — DEV-only bottom-left badge that surfaces the latest
 * `wave4:layout_fault` so we can never silently overlap, clip, or distort.
 *
 * Visible only when `import.meta.env.DEV` is true OR `?wave4_debug=1` is in
 * the URL OR `localStorage.wave4_debug=1`. Production users see nothing.
 */

import { useHideDebugUI } from "@/lib/debugUIVisibility";
import { useDebugPillEnabled } from "@/lib/debugTray/debugPillsStore";
import { useInDebugTray } from "@/lib/debugTray/DebugTray";
import { useEffect, useState } from "react";
import {
  getRecentLayoutFaults,
  onLayoutFault,
  type LayoutFaultEvent,
} from "./telemetry";

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wave4_debug") === "1") return true;
    if (window.localStorage.getItem("wave4_debug") === "1") return true;
  } catch {
    /* noop */
  }
  // Vite's import.meta.env.DEV — defaults true in dev preview, false in prod.
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
}

export function LayoutFaultBadge() {
  const [enabled] = useState<boolean>(debugEnabled);
  const pillEnabled = useDebugPillEnabled('layoutFault');
  const inTray = useInDebugTray();
  const [latest, setLatest] = useState<LayoutFaultEvent | null>(() => {
    const r = getRecentLayoutFaults();
    return r.length ? r[r.length - 1] : null;
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return onLayoutFault((e) => setLatest(e));
  }, [enabled]);

  const hideDebug = useHideDebugUI();
  if (hideDebug || !enabled || !pillEnabled || !latest) return null;

  const wrapperStyle: React.CSSProperties = inTray
    ? {
        position: "relative",
        display: "inline-block",
        background: "rgba(120, 0, 0, 0.92)",
        color: "white",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "6px 10px",
        borderRadius: 4,
        maxWidth: expanded ? 360 : 200,
        cursor: "pointer",
        pointerEvents: "auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }
    : {
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 99999,
        background: "rgba(120, 0, 0, 0.92)",
        color: "white",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "6px 10px",
        borderRadius: 4,
        maxWidth: expanded ? 360 : 200,
        cursor: "pointer",
        pointerEvents: "auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      };

  return (
    <div
      data-wave4-fault-badge=""
      onClick={() => setExpanded((v) => !v)}
      style={wrapperStyle}
      title="Click to expand / collapse"
    >
      <div style={{ fontWeight: 700 }}>⚠ wave4:layout_fault</div>
      <div style={{ opacity: 0.85 }}>
        {latest.faults.length} fault{latest.faults.length === 1 ? "" : "s"} ·{" "}
        {latest.viewportBucket} · {latest.orientation}
      </div>
      {expanded ? (
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          {latest.faults.map((f, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              <div style={{ fontWeight: 600 }}>{f.code}</div>
              <div style={{ opacity: 0.8 }}>{f.message}</div>
              <div style={{ opacity: 0.7 }}>ids: {f.artifactIds.join(", ")}</div>
            </div>
          ))}
          <div style={{ marginTop: 6, opacity: 0.6 }}>
            last layout hash: {latest.layoutHash}
          </div>
        </div>
      ) : null}
    </div>
  );
}
