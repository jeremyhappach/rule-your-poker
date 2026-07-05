/**
 * IncidentReportBanner — compact non-blocking banner that appears
 * after any auto-generated voice incident autopsy row lands for the
 * current user. Non-interactive by default; an Export button downloads
 * a human-readable `.txt` incident report.
 *
 * The banner ACKS the report by writing acknowledged_at, so the user
 * only ever sees each report once.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ReportRow {
  id: string;
  correlation_id: string;
  report_status: "pending" | "complete" | "incomplete";
  narrative: string | null;
  event_count: number;
  outbox_count: number | null;
  missing_boundaries: unknown;
  timeline: unknown;
  outcome: unknown;
  first_event: unknown;
  last_confirmed_local_event: unknown;
  last_capsule_event: unknown;
  last_server_event: unknown;
  last_outbox_result: unknown;
  last_incident_patch: unknown;
  last_instance_heartbeat: unknown;
  recovery_status: unknown;
  network_findings: unknown;
  lifecycle_findings: unknown;
  route_findings: unknown;
  auth_findings: unknown;
  session_findings: unknown;
  data_completeness: unknown;
  original_client_instance_id: string | null;
  original_tab_session_id: string | null;
  original_origin: string | null;
  original_route: string | null;
  recovery_client_instance_id: string | null;
  recovery_tab_session_id: string | null;
  recovery_origin: string | null;
  recovery_route: string | null;
  completed_at: string | null;
  updated_at: string;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "n/a";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function buildTxt(row: ReportRow): string {
  const lines: string[] = [];
  const push = (s: string = "") => lines.push(s);
  const sep = (title: string) => {
    push("");
    push(`── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
  };

  push(`Voice Incident Report`);
  push(`=====================`);
  push(`Correlation ID: ${row.correlation_id}`);
  push(`Report status : ${row.report_status}`);
  push(`Updated at    : ${row.updated_at}`);
  push(`Completed at  : ${row.completed_at ?? "n/a"}`);
  push(`Event count   : ${row.event_count}`);
  push(`Outbox count  : ${row.outbox_count ?? 0}`);

  sep("OUTCOME");
  push(fmt(row.outcome));

  sep("ORIGINAL IDENTITY / ORIGIN / ROUTE");
  push(`client_instance_id : ${row.original_client_instance_id ?? "n/a"}`);
  push(`tab_session_id     : ${row.original_tab_session_id ?? "n/a"}`);
  push(`origin             : ${row.original_origin ?? "n/a"}`);
  push(`route              : ${row.original_route ?? "n/a"}`);

  sep("RECOVERY IDENTITY / ORIGIN / ROUTE");
  push(`client_instance_id : ${row.recovery_client_instance_id ?? "n/a"}`);
  push(`tab_session_id     : ${row.recovery_tab_session_id ?? "n/a"}`);
  push(`origin             : ${row.recovery_origin ?? "n/a"}`);
  push(`route              : ${row.recovery_route ?? "n/a"}`);

  sep("LAST CONFIRMED BOUNDARIES");
  push(`first_event              : ${fmt(row.first_event)}`);
  push(`last_confirmed_local     : ${fmt(row.last_confirmed_local_event)}`);
  push(`last_capsule_event       : ${fmt(row.last_capsule_event)}`);
  push(`last_server_event        : ${fmt(row.last_server_event)}`);
  push(`last_outbox_result       : ${fmt(row.last_outbox_result)}`);
  push(`last_incident_patch      : ${fmt(row.last_incident_patch)}`);
  push(`last_instance_heartbeat  : ${fmt(row.last_instance_heartbeat)}`);

  sep("MISSING EXPECTED BOUNDARIES");
  push(fmt(row.missing_boundaries));

  sep("NETWORK FINDINGS");
  push(fmt(row.network_findings));

  sep("LIFECYCLE FINDINGS");
  push(fmt(row.lifecycle_findings));

  sep("ROUTE FINDINGS");
  push(fmt(row.route_findings));

  sep("AUTH FINDINGS");
  push(fmt(row.auth_findings));

  sep("SESSION FINDINGS");
  push(fmt(row.session_findings));

  sep("RECOVERY STATUS");
  push(fmt(row.recovery_status));

  sep("DATA COMPLETENESS");
  push(fmt(row.data_completeness));

  sep("EVIDENCE-ONLY NARRATIVE");
  push(row.narrative ?? "(no narrative)");

  sep("STRICT TIMESTAMP TIMELINE");
  const timeline = Array.isArray(row.timeline) ? row.timeline as unknown[] : [];
  if (timeline.length === 0) {
    push("(empty)");
  } else {
    for (const t of timeline) {
      const r = t as {
        t?: string;
        source?: string;
        name?: string;
        family?: string | null;
        severity?: string | null;
        client_instance_id?: string | null;
        tab_session_id?: string | null;
        route?: string | null;
      };
      push(
        `${r.t ?? "?"}  [${r.source ?? "?"}]  ${r.name ?? "?"}` +
        ` fam=${r.family ?? "-"} sev=${r.severity ?? "-"}` +
        ` ci=${r.client_instance_id ?? "-"} tab=${r.tab_session_id ?? "-"}` +
        ` route=${r.route ?? "-"}`,
      );
    }
  }

  return lines.join("\n");
}

export function IncidentReportBanner() {
  const [row, setRow] = useState<ReportRow | null>(null);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;

    const load = async () => {
      const { data: sess } = await supabase.auth.getUser();
      userId = sess?.user?.id ?? null;
      if (!userId) return;
      const { data } = await supabase
        .from("client_runtime_incident_reports")
        .select(
          "id, correlation_id, report_status, narrative, event_count, outbox_count, missing_boundaries, timeline, outcome, first_event, last_confirmed_local_event, last_capsule_event, last_server_event, last_outbox_result, last_incident_patch, last_instance_heartbeat, recovery_status, network_findings, lifecycle_findings, route_findings, auth_findings, session_findings, data_completeness, original_client_instance_id, original_tab_session_id, original_origin, original_route, recovery_client_instance_id, recovery_tab_session_id, recovery_origin, recovery_route, completed_at, updated_at",
        )
        .eq("user_id", userId)
        .is("acknowledged_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setRow(data as unknown as ReportRow);
    };

    void load();
    const channel = supabase
      .channel("incident-reports-banner")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_runtime_incident_reports",
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  if (!row) return null;

  const label =
    row.report_status === "incomplete"
      ? "Voice incident report incomplete — recovery evidence missing"
      : "Voice incident report captured";

  const bgColor =
    row.report_status === "incomplete" ? "bg-amber-600" : "bg-emerald-700";

  const exportTxt = () => {
    try {
      const txt = buildTxt(row);
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voice-incident-${row.correlation_id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setExported(true);
      setTimeout(() => setExported(false), 1200);
    } catch {
      /* noop */
    }
  };

  const dismiss = async () => {
    await supabase
      .from("client_runtime_incident_reports")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", row.id);
    setRow(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483646,
        maxWidth: "92vw",
        pointerEvents: "auto",
      }}
      className={`${bgColor} text-white text-xs px-3 py-2 rounded shadow-lg flex items-center gap-3`}
    >
      <span>{label}</span>
      <span className="opacity-70">· {row.event_count} events</span>
      <button
        onClick={exportTxt}
        className="underline hover:no-underline"
        type="button"
        aria-label="Export incident report as .txt"
      >
        {exported ? "exported .txt" : "export .txt"}
      </button>
      <button
        onClick={dismiss}
        className="underline hover:no-underline"
        type="button"
      >
        dismiss
      </button>
    </div>
  );
}
