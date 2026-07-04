import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearSessionLifecycleTrace,
  exportSessionLifecycleTrace,
  readSessionIncidents,
  readSessionLifecycleEvents,
  getCommittedActiveSession,
} from "@/lib/sessionLifecycleLedger";
import {
  exportAuthEjectionTrace,
  readAuthEjectionEvents,
} from "@/lib/authEjectionLedger";

/**
 * Boot-level diagnostics page. Reachable from the always-mounted
 * SessionLifecycleRecoveryPill regardless of which surface currently
 * owns the screen. Never mounts game UI, never touches auth state.
 */
export default function Diagnostics() {
  const [tick, setTick] = useState(0);
  const events = useMemo(() => readSessionLifecycleEvents().slice().reverse(), [tick]);
  const incidents = useMemo(() => readSessionIncidents().slice().reverse(), [tick]);
  const authEvents = useMemo(() => readAuthEjectionEvents().slice().reverse(), [tick]);
  const committed = getCommittedActiveSession();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
  };

  const download = (filename: string, text: string) => {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#f8fafc",
        padding: 16,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
      }}
    >
      <header style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Session lifecycle diagnostics</h1>
        <Link to="/" style={{ color: "#93c5fd", marginLeft: "auto" }}>
          Home
        </Link>
      </header>

      <section style={{ marginBottom: 12 }}>
        <strong>Committed active session:</strong>{" "}
        <code>{committed ? JSON.stringify(committed) : "null"}</code>
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTick((n) => n + 1)}>Refresh</button>
        <button onClick={() => copy(exportSessionLifecycleTrace())}>
          Copy session ledger
        </button>
        <button onClick={() => download("session-lifecycle-ledger.json", exportSessionLifecycleTrace())}>
          Download session ledger
        </button>
        <button onClick={() => copy(exportAuthEjectionTrace())}>
          Copy auth-ejection ledger
        </button>
        <button onClick={() => download("auth-ejection-ledger.json", exportAuthEjectionTrace())}>
          Download auth-ejection ledger
        </button>
        <button
          onClick={() => {
            if (window.confirm("Clear session lifecycle ledger?")) {
              clearSessionLifecycleTrace();
              setTick((n) => n + 1);
            }
          }}
        >
          Clear session ledger
        </button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
          Incidents ({incidents.length})
        </h2>
        {incidents.length === 0 && <p style={{ color: "#94a3b8" }}>No incidents recorded.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {incidents.map((i) => (
            <li
              key={i.key}
              style={{
                border: "1px solid #7f1d1d",
                background: "#1f0808",
                borderRadius: 4,
                padding: 6,
                marginBottom: 6,
              }}
            >
              <div>
                <strong>{i.kind}</strong>{" "}
                <span style={{ color: "#94a3b8" }}>
                  {new Date(i.ts).toISOString()}
                </span>
              </div>
              <div style={{ color: "#cbd5e1", wordBreak: "break-all" }}>key: {i.key}</div>
              <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0 0" }}>
                ctx: {JSON.stringify(i.ctx)}
                {"\n"}detail: {JSON.stringify(i.detail)}
              </pre>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
          Session lifecycle events ({events.length})
        </h2>
        <ol reversed style={{ paddingLeft: 20, margin: 0 }}>
          {events.map((e) => (
            <li key={e.seq} style={{ marginBottom: 4 }}>
              <span style={{ color: "#94a3b8" }}>
                {new Date(e.ts).toISOString().slice(11, 23)}{" "}
              </span>
              <strong>{e.kind}</strong>{" "}
              <span style={{ color: "#cbd5e1" }}>{JSON.stringify(e.detail)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
          Auth-ejection ledger ({authEvents.length})
        </h2>
        <ol reversed style={{ paddingLeft: 20, margin: 0 }}>
          {authEvents.map((e, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              <span style={{ color: "#94a3b8" }}>
                {new Date(e.ts).toISOString().slice(11, 23)}{" "}
              </span>
              <strong>{e.kind}</strong>{" "}
              <span style={{ color: "#cbd5e1" }}>{JSON.stringify(e.detail)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
