import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  exportSessionLifecycleTrace,
  readSessionIncidents,
} from "@/lib/sessionLifecycleLedger";

/**
 * Always-mounted, boot-level recovery pill. Visible on every route —
 * including `/auth` and any legacy Join fallback — so the operator can
 * reach `/diagnostics` when the game UI itself is gone. Non-intrusive:
 * tiny fixed link in the corner. Never mutates any auth/session state.
 */
export function SessionLifecycleRecoveryPill() {
  const [incidentCount, setIncidentCount] = useState<number>(0);

  useEffect(() => {
    // Refresh count on mount + every 3s so an incident that lands after
    // this pill mounts is reflected without a full reload.
    const tick = () => setIncidentCount(readSessionIncidents().length);
    tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        left: 6,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
        zIndex: 2147483647,
        pointerEvents: "auto",
        fontSize: 10,
        lineHeight: 1,
        display: "flex",
        gap: 4,
      }}
    >
      <Link
        to="/diagnostics"
        style={{
          background: incidentCount > 0 ? "#7f1d1d" : "#111827",
          color: "#f9fafb",
          borderRadius: 4,
          padding: "3px 6px",
          textDecoration: "none",
          border: "1px solid rgba(255,255,255,0.15)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
        title="Session lifecycle diagnostics"
      >
        DIAG{incidentCount > 0 ? ` ⚠${incidentCount}` : ""}
      </Link>
      <button
        type="button"
        onClick={() => {
          try {
            const txt = exportSessionLifecycleTrace();
            void navigator.clipboard?.writeText(txt);
          } catch {
            /* noop */
          }
        }}
        style={{
          background: "#111827",
          color: "#f9fafb",
          borderRadius: 4,
          padding: "3px 6px",
          border: "1px solid rgba(255,255,255,0.15)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          cursor: "pointer",
        }}
        title="Copy full session lifecycle trace to clipboard"
      >
        COPY
      </button>
    </div>
  );
}
