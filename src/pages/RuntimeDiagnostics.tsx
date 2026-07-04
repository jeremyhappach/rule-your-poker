import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * RuntimeDiagnostics — protected internal query surface over the
 * server-persisted runtime instrumentation tables:
 *
 *   client_runtime_instances
 *   client_runtime_events
 *   client_runtime_incidents
 *   chat_message_delivery_trace
 *
 * Admin-gated. Read-only. Copy/export is a convenience — the database
 * is the source of truth.
 */

type Row = Record<string, unknown>;

type Filters = {
  gameId: string;
  clientInstanceId: string;
  userId: string;
  messageId: string;
  voiceOperationId: string;
  correlationId: string;
  eventFamily: string;
  sinceMinutes: number;
};

const emptyFilters: Filters = {
  gameId: "",
  clientInstanceId: "",
  userId: "",
  messageId: "",
  voiceOperationId: "",
  correlationId: "",
  eventFamily: "",
  sinceMinutes: 60,
};

export default function RuntimeDiagnostics() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);
  const { isAdmin, loading: adminLoading } = useIsAdmin(userId);

  const [tab, setTab] = useState<"events" | "incidents" | "delivery" | "instances" | "incident-merged">("events");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMarkers, setLastMarkers] = useState<Row | null>(null);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setLastMarkers(null);
    try {
      const sinceIso = new Date(Date.now() - filters.sinceMinutes * 60_000).toISOString();
      if (tab === "events") {
        let q = supabase.from("client_runtime_events").select("*")
          .gte("occurred_at_server", sinceIso)
          .order("occurred_at_server", { ascending: false })
          .limit(500);
        if (filters.gameId) q = q.eq("game_id", filters.gameId);
        if (filters.clientInstanceId) q = q.eq("client_instance_id", filters.clientInstanceId);
        if (filters.userId) q = q.eq("user_id", filters.userId);
        if (filters.messageId) q = q.eq("message_id", filters.messageId);
        if (filters.voiceOperationId) q = q.eq("voice_operation_id", filters.voiceOperationId);
        if (filters.correlationId) q = q.eq("correlation_id", filters.correlationId);
        if (filters.eventFamily) q = q.eq("event_family", filters.eventFamily);
        const { data, error: e } = await q;
        if (e) throw e;
        setRows((data ?? []) as Row[]);
      } else if (tab === "incidents") {
        let q = supabase.from("client_runtime_incidents").select("*")
          .gte("detected_at", sinceIso)
          .order("detected_at", { ascending: false })
          .limit(200);
        if (filters.gameId) q = q.eq("game_id", filters.gameId);
        if (filters.clientInstanceId) q = q.eq("client_instance_id", filters.clientInstanceId);
        if (filters.userId) q = q.eq("user_id", filters.userId);
        if (filters.messageId) q = q.eq("message_id", filters.messageId);
        if (filters.voiceOperationId) q = q.eq("voice_operation_id", filters.voiceOperationId);
        const { data, error: e } = await q;
        if (e) throw e;
        setRows((data ?? []) as Row[]);
      } else if (tab === "delivery") {
        let q = supabase.from("chat_message_delivery_trace").select("*")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
        if (filters.gameId) q = q.eq("game_id", filters.gameId);
        if (filters.messageId) q = q.eq("message_id", filters.messageId);
        if (filters.correlationId) q = q.eq("correlation_id", filters.correlationId);
        if (filters.voiceOperationId) q = q.eq("voice_operation_id", filters.voiceOperationId);
        const { data, error: e } = await q;
        if (e) throw e;
        setRows((data ?? []) as Row[]);
      } else if (tab === "incident-merged") {
        const cid = filters.correlationId.trim();
        if (!cid) throw new Error("incident-merged view requires a correlation_id");
        const merged: Row[] = [];
        // 1. Incident row
        const inc = await supabase.from("client_runtime_incidents").select("*").eq("correlation_id", cid).limit(5);
        for (const r of inc.data ?? []) merged.push({ __source: "incident", __ts: (r as Row).detected_at, ...r });
        // 2. Instance rows
        const instClient = (inc.data?.[0] as { client_instance_id?: string } | undefined)?.client_instance_id;
        if (instClient) {
          const ins = await supabase.from("client_runtime_instances").select("*").eq("client_instance_id", instClient).limit(10);
          for (const r of ins.data ?? []) merged.push({ __source: "instance", __ts: (r as Row).last_seen_at, ...r });
        }
        // 3. Server events
        const evs = await supabase.from("client_runtime_events").select("*").eq("correlation_id", cid).order("occurred_at_client", { ascending: true }).limit(2000);
        for (const r of evs.data ?? []) merged.push({ __source: "event", __ts: (r as Row).occurred_at_client, ...r });
        // 4. Outbox rows
        const obx = await supabase.from("client_runtime_event_outbox").select("*").eq("correlation_id", cid).order("created_at", { ascending: true }).limit(2000);
        for (const r of obx.data ?? []) merged.push({ __source: "outbox", __ts: (r as Row).created_at, ...r });
        merged.sort((a, b) => String(a.__ts ?? "").localeCompare(String(b.__ts ?? "")));

        // Explicit markers
        const evList = (evs.data ?? []) as Row[];
        const outboxDelivered = (obx.data ?? []).filter((r) => (r as Row).status === "delivered") as Row[];
        const findLast = (pred: (r: Row) => boolean) => {
          for (let i = evList.length - 1; i >= 0; i--) if (pred(evList[i])) return evList[i];
          return null;
        };
        setLastMarkers({
          lastDbConfirmedEvent: outboxDelivered.length ? outboxDelivered[outboxDelivered.length - 1] : null,
          lastReadBackVerifiedEvent: findLast((r) => r.event_name === "CAPSULE_LOCAL_APPEND_VERIFIED"),
          lastIncidentPatch: findLast((r) => r.event_name === "INCIDENT_PATCH_VERIFIED"),
          lastInstanceHeartbeat: findLast((r) => r.event_name === "INSTANCE_HEARTBEAT_VERIFIED"),
          lastBootRecoveryEvent: findLast((r) =>
            r.event_name === "RUNTIME_BOOT_EARLY" ||
            r.event_name === "CAPSULE_SCAN_COMPLETE" ||
            r.event_name === "BOOT_RECOVERY_AUTH_LINKED" ||
            r.event_name === "CAPSULE_RECOVERED_AFTER_BOOT",
          ),
        });
        setRows(merged);
      } else {
        let q = supabase.from("client_runtime_instances").select("*")
          .order("last_seen_at", { ascending: false })
          .limit(200);
        if (filters.clientInstanceId) q = q.eq("client_instance_id", filters.clientInstanceId);
        if (filters.userId) q = q.eq("user_id", filters.userId);
        const { data, error: e } = await q;
        if (e) throw e;
        setRows((data ?? []) as Row[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const copyRows = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(rows, null, 2)); } catch { /* noop */ }
  };

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const set = new Set<string>();
    for (const r of rows.slice(0, 20)) Object.keys(r).forEach((k) => set.add(k));
    return Array.from(set);
  }, [rows]);

  if (adminLoading) {
    return <main style={pageStyle}><p>Checking access…</p></main>;
  }
  if (!isAdmin) {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: 18 }}>Runtime diagnostics</h1>
        <p style={{ color: "#f87171" }}>Admin access required.</p>
        <Link to="/" style={{ color: "#93c5fd" }}>Home</Link>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Runtime diagnostics</h1>
        <Link to="/diagnostics" style={{ color: "#93c5fd", marginLeft: 8 }}>Legacy session diagnostics</Link>
        <Link to="/" style={{ color: "#93c5fd", marginLeft: "auto" }}>Home</Link>
      </header>

      <nav style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["events", "incidents", "delivery", "instances"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setRows([]); }}
            style={{
              padding: "4px 10px",
              background: tab === t ? "#334155" : "#1e293b",
              color: "#f1f5f9",
              border: "1px solid #475569",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginBottom: 8 }}>
        <TextField label="game_id" value={filters.gameId} onChange={(v) => setFilters({ ...filters, gameId: v })} />
        <TextField label="client_instance_id" value={filters.clientInstanceId} onChange={(v) => setFilters({ ...filters, clientInstanceId: v })} />
        <TextField label="user_id" value={filters.userId} onChange={(v) => setFilters({ ...filters, userId: v })} />
        <TextField label="message_id" value={filters.messageId} onChange={(v) => setFilters({ ...filters, messageId: v })} />
        <TextField label="voice_operation_id" value={filters.voiceOperationId} onChange={(v) => setFilters({ ...filters, voiceOperationId: v })} />
        <TextField label="correlation_id" value={filters.correlationId} onChange={(v) => setFilters({ ...filters, correlationId: v })} />
        <TextField label="event_family" value={filters.eventFamily} onChange={(v) => setFilters({ ...filters, eventFamily: v })} />
        <label style={{ fontSize: 11, display: "flex", flexDirection: "column" }}>
          since (min)
          <input
            type="number"
            value={filters.sinceMinutes}
            onChange={(e) => setFilters({ ...filters, sinceMinutes: Number(e.target.value) || 60 })}
            style={inputStyle}
          />
        </label>
      </section>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={runQuery} disabled={loading} style={buttonStyle}>
          {loading ? "Loading…" : "Run query"}
        </button>
        <button onClick={copyRows} disabled={rows.length === 0} style={buttonStyle}>Copy JSON</button>
        <button onClick={() => setFilters(emptyFilters)} style={buttonStyle}>Clear filters</button>
      </div>

      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      <p style={{ color: "#94a3b8", fontSize: 11 }}>
        {rows.length} row{rows.length === 1 ? "" : "s"}
      </p>

      <div style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid #334155" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#1e293b" }}>
            <tr>
              {columns.map((c) => (
                <th key={c} style={cellStyle}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #334155" }}>
                {columns.map((c) => {
                  const v = r[c];
                  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
                  return (
                    <td key={c} style={{ ...cellStyle, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s}>
                      {s}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "#f8fafc",
  padding: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const inputStyle: React.CSSProperties = {
  background: "#0b1220",
  color: "#f8fafc",
  border: "1px solid #334155",
  padding: "4px 6px",
  borderRadius: 3,
  fontSize: 11,
};

const buttonStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "#1e293b",
  color: "#f1f5f9",
  border: "1px solid #475569",
  borderRadius: 4,
  cursor: "pointer",
};

const cellStyle: React.CSSProperties = {
  border: "1px solid #334155",
  padding: "3px 6px",
  textAlign: "left",
  verticalAlign: "top",
};

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ fontSize: 11, display: "flex", flexDirection: "column" }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}
