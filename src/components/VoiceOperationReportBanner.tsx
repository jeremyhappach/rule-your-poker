/**
 * VoiceOperationReportBanner — server-first surfacing of automatic
 * voice-operation reports. Subscribes to public.voice_operation_reports
 * via realtime; RLS ("vor_select_related") transparently exposes both:
 *   - the local user's own reports (sender_user_id = auth.uid()), and
 *   - reports for any incident scoped to a game the user is currently
 *     in (game_id → user_is_in_game).
 *
 * Any surviving peer at the same table therefore automatically receives
 * the report through realtime and can export the same readable TXT
 * without waiting for the failed sender to recover.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ReportRow {
  voice_operation_id: string;
  sender_user_id: string | null;
  game_id: string | null;
  terminal_status: string;
  report_text: string;
  finalized_at: string;
}

export const VoiceOperationReportBanner = (): JSX.Element | null => {
  const [row, setRow] = useState<ReportRow | null>(null);
  const [senderLabel, setSenderLabel] = useState<string | null>(null);
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

    const consider = (r: ReportRow | null | undefined) => {
      if (!r?.voice_operation_id) return;
      setRow((prev) => {
        if (!prev) return r;
        // Prefer the newer finalized_at
        return new Date(r.finalized_at) >= new Date(prev.finalized_at) ? r : prev;
      });
    };

    // Initial fetch: RLS returns own + peer-visible reports.
    void supabase
      .from("voice_operation_reports")
      .select("voice_operation_id,sender_user_id,game_id,terminal_status,report_text,finalized_at")
      .order("finalized_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) consider(data[0] as ReportRow);
      });

    // Realtime: no server-side filter — RLS enforces access, and we want
    // peer reports (sender_user_id !== me) to arrive too.
    const ch = supabase
      .channel(`voice-report-any-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_operation_reports" },
        (payload) => consider(payload.new as ReportRow),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  // Resolve a safe display label for the sender when this is a peer report.
  useEffect(() => {
    setSenderLabel(null);
    if (!row?.sender_user_id || !userId || row.sender_user_id === userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("username")
      .eq("id", row.sender_user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          const u = (data as { username?: string } | null)?.username;
          setSenderLabel(u ?? `${row.sender_user_id!.slice(0, 8)}…`);
        }
      });
    return () => { cancelled = true; };
  }, [row?.sender_user_id, userId]);

  if (!row || dismissed.has(row.voice_operation_id)) return null;

  const isPeer = !!(userId && row.sender_user_id && row.sender_user_id !== userId);

  const download = () => {
    const blob = new Blob([row.report_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-incident-${row.voice_operation_id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const dismiss = () => {
    setDismissed((prev) => new Set(prev).add(row.voice_operation_id));
  };

  const title = isPeer
    ? `Peer voice incident report captured${senderLabel ? ` — ${senderLabel}` : ""}`
    : "Voice incident report captured";

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
        {title}
      </div>
      <div style={{ opacity: 0.8, marginBottom: 8 }}>
        {row.terminal_status} · {row.voice_operation_id.slice(0, 8)}…
        {isPeer ? " · peer-witnessed" : ""}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={download}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          Export .txt
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
