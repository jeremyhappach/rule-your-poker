/**
 * IncidentReportBanner — compact non-blocking banner that appears
 * after any auto-generated voice incident autopsy row lands for the
 * current user. Non-interactive by default; a Copy button surfaces the
 * report JSON for optional export.
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
  missing_boundaries: unknown;
  timeline: unknown;
  updated_at: string;
}

export function IncidentReportBanner() {
  const [row, setRow] = useState<ReportRow | null>(null);
  const [copied, setCopied] = useState(false);

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
          "id, correlation_id, report_status, narrative, event_count, missing_boundaries, timeline, updated_at",
        )
        .eq("user_id", userId)
        .is("acknowledged_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setRow(data as ReportRow);
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

  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(row, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voice-incident-${row.correlation_id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
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
        onClick={exportJson}
        className="underline hover:no-underline"
        type="button"
      >
        {copied ? "exported" : "export"}
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
