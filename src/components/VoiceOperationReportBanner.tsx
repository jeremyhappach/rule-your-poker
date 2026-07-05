/**
 * VoiceOperationReportBanner — server-first surfacing of automatic
 * voice-operation reports. Subscribes to public.voice_operation_reports
 * (realtime) filtered by the current user, shows a non-blocking banner
 * with a Download TXT button. No manual query, export, or reconnect
 * required.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ReportRow {
  voice_operation_id: string;
  terminal_status: string;
  report_text: string;
  finalized_at: string;
}

export const VoiceOperationReportBanner = (): JSX.Element | null => {
  const [row, setRow] = useState<ReportRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    // Fetch the most recent report on mount (covers "any authenticated
    // client returns" — no reconnect required from the failing client).
    void supabase
      .from("voice_operation_reports")
      .select("voice_operation_id,terminal_status,report_text,finalized_at")
      .eq("sender_user_id", userId)
      .order("finalized_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setRow(data[0] as ReportRow);
      });

    const ch = supabase
      .channel(`voice-report-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_operation_reports", filter: `sender_user_id=eq.${userId}` },
        (payload) => {
          const r = payload.new as ReportRow;
          if (r?.voice_operation_id) setRow(r);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  if (!row || dismissed.has(row.voice_operation_id)) return null;

  const download = () => {
    const blob = new Blob([row.report_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-operation-${row.voice_operation_id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const dismiss = () => {
    setDismissed((prev) => new Set(prev).add(row.voice_operation_id));
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: 12, left: 12, zIndex: 9999,
        maxWidth: 360, padding: "10px 12px",
        background: "hsl(var(--card))", color: "hsl(var(--card-foreground))",
        border: "1px solid hsl(var(--border))", borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)", fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Voice incident report captured
      </div>
      <div style={{ opacity: 0.8, marginBottom: 8 }}>
        {row.terminal_status} · {row.voice_operation_id.slice(0, 8)}…
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={download}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          Download .txt
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid hsl(var(--border))", background: "transparent", color: "inherit" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
