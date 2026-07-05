/**
 * IncidentExportPill — the single, session-scoped incident export UI.
 *
 * Contract:
 *   - Exactly one pill in the normal shell chrome, labelled "Export Incident".
 *   - Exports one readable TXT for the most recent RELEVANT incident in the
 *     current browser/app session.
 *   - Never surfaces a list, never shows old/historical incident rows across
 *     a session boundary, never shows synthetic/self-check reports.
 *
 * Session boundary:
 *   - a module-scoped SESSION_TOKEN is minted on module load (fresh app
 *     boot / hard reload / new tab). Only incidents whose `updated_at` is
 *     >= SESSION_START_ISO are considered current-session;
 *   - the currently-visible incident is also gated on route-derived
 *     current gameId — leaving/joining a table hides the pill.
 *
 * Current relevance:
 *   - matches on the current `/game/:id` route id (own session) OR
 *   - is a peer voice_operation_reports row whose game_id matches the
 *     current gameId (peer at the same active table).
 *
 * Replace, do not stack:
 *   - one target only. A newer relevant incident replaces the prior one.
 *
 * This component replaces:
 *   - IncidentReportBanner
 *   - VoiceOperationReportBanner
 *   - ChatDeliveryExportPill (as a user-facing pill; the ledger module
 *     itself remains intact for internal use).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SESSION_START_ISO = new Date().toISOString();
const SESSION_TOKEN = `sess-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

type IncidentKind = 'client_runtime' | 'voice_operation';

interface CurrentIncident {
  kind: IncidentKind;
  key: string;                 // stable de-dupe id
  gameId: string | null;
  createdAt: string;
  reportText: string;          // readable TXT payload
  label: string;               // short pill sublabel
}

function extractRouteGameId(pathname: string): string | null {
  const m = pathname.match(/\/game\/([0-9a-f-]{8,})/i);
  return m ? m[1] : null;
}

function routeMatchesGame(route: string | null | undefined, gameId: string | null): boolean {
  if (!route || !gameId) return false;
  return route.includes(gameId);
}

function buildClientRuntimeTxt(row: Record<string, unknown>): string {
  const push: string[] = [];
  const p = (k: string, v: unknown) =>
    push.push(`${k.padEnd(28)}: ${v === null || v === undefined ? 'n/a' : typeof v === 'string' ? v : JSON.stringify(v)}`);
  push.push('Voice / Runtime Incident Report');
  push.push('===============================');
  p('correlation_id', row.correlation_id);
  p('report_status', row.report_status);
  p('updated_at', row.updated_at);
  p('completed_at', row.completed_at);
  p('event_count', row.event_count);
  p('original_route', row.original_route);
  p('recovery_route', row.recovery_route);
  push.push('');
  push.push('OUTCOME');
  push.push(JSON.stringify(row.outcome ?? null, null, 2));
  push.push('');
  push.push('NARRATIVE');
  push.push((row.narrative as string) ?? '(none)');
  push.push('');
  push.push('MISSING BOUNDARIES');
  push.push(JSON.stringify(row.missing_boundaries ?? null, null, 2));
  push.push('');
  push.push('TIMELINE');
  const tl = Array.isArray(row.timeline) ? (row.timeline as unknown[]) : [];
  for (const t of tl) push.push(JSON.stringify(t));
  return push.join('\n');
}

export function IncidentExportPill(): JSX.Element | null {
  const location = useLocation();
  const routeGameId = useMemo(() => extractRouteGameId(location.pathname), [location.pathname]);
  const [userId, setUserId] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentIncident | null>(null);
  const currentRef = useRef<CurrentIncident | null>(null);
  currentRef.current = current;

  // Session boundary: whenever the active gameId changes (join/leave/switch),
  // clear the currently visible incident.
  const lastGameIdRef = useRef<string | null>(routeGameId);
  useEffect(() => {
    if (lastGameIdRef.current !== routeGameId) {
      lastGameIdRef.current = routeGameId;
      setCurrent(null);
    }
  }, [routeGameId]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Replace-not-stack: single setter used by every source.
  const offer = (next: CurrentIncident) => {
    if (new Date(next.createdAt) < new Date(SESSION_START_ISO)) return;
    // Relevance filter: must match current gameId (own or peer) when route has one.
    if (routeGameId && next.gameId && next.gameId !== routeGameId) return;
    // If no route gameId, do not surface game-scoped peer incidents.
    if (!routeGameId && next.kind === 'voice_operation') return;
    setCurrent((prev) => {
      if (!prev) return next;
      return new Date(next.createdAt) >= new Date(prev.createdAt) ? next : prev;
    });
  };

  // ---- client_runtime_incident_reports (own incidents) ----
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('client_runtime_incident_reports')
        .select(
          'id, correlation_id, report_status, narrative, event_count, missing_boundaries, timeline, outcome, original_route, recovery_route, completed_at, updated_at',
        )
        .eq('user_id', userId)
        .gte('updated_at', SESSION_START_ISO)
        .not('correlation_id', 'ilike', 'self-check-%')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as Record<string, unknown>;
      const cid = (row.correlation_id as string) ?? '';
      if (cid.startsWith('self-check-')) return;
      const status = (row.report_status as string) ?? '';
      if (status.startsWith('self-check')) return;
      const outcome = row.outcome as Record<string, unknown> | null;
      if (outcome && outcome.self_check === true) return;
      const routeStr =
        (row.recovery_route as string | null) ?? (row.original_route as string | null) ?? null;
      const rowGameId = routeStr ? extractRouteGameId(routeStr) : null;
      if (routeGameId && rowGameId && rowGameId !== routeGameId) return;
      offer({
        kind: 'client_runtime',
        key: `crir-${cid}`,
        gameId: rowGameId,
        createdAt: (row.updated_at as string) ?? SESSION_START_ISO,
        reportText: buildClientRuntimeTxt(row),
        label: `runtime · ${status || 'pending'}`,
      });
    };
    void load();
    const ch = supabase
      .channel(`incident-export-crir-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_runtime_incident_reports', filter: `user_id=eq.${userId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId, routeGameId]);

  // ---- voice_operation_reports (own + peer via RLS) ----
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('voice_operation_reports')
        .select('voice_operation_id, sender_user_id, game_id, terminal_status, report_text, finalized_at')
        .gte('finalized_at', SESSION_START_ISO)
        .not('voice_operation_id', 'ilike', 'self-check-%')
        .not('terminal_status', 'ilike', 'self-check%')
        .order('finalized_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as {
        voice_operation_id: string; sender_user_id: string | null; game_id: string | null;
        terminal_status: string; report_text: string; finalized_at: string;
      };
      if (row.voice_operation_id.startsWith('self-check-')) return;
      if ((row.terminal_status ?? '').startsWith('self-check')) return;
      if (routeGameId && row.game_id && row.game_id !== routeGameId) return;
      const isPeer = !!(row.sender_user_id && row.sender_user_id !== userId);
      offer({
        kind: 'voice_operation',
        key: `vor-${row.voice_operation_id}`,
        gameId: row.game_id,
        createdAt: row.finalized_at,
        reportText: row.report_text,
        label: `voice · ${row.terminal_status}${isPeer ? ' · peer' : ''}`,
      });
    };
    void load();
    const ch = supabase
      .channel(`incident-export-vor-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_operation_reports' },
        () => { void load(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId, routeGameId]);

  if (!current) return null;

  const download = () => {
    const blob = new Blob([current.reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-${current.key}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div
      role="status"
      data-incident-export-pill=""
      data-incident-session-token={SESSION_TOKEN}
      data-incident-kind={current.kind}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483646,
        maxWidth: '92vw',
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-2 rounded border border-amber-400/60 bg-black/85 px-3 py-1.5 text-[11px] text-amber-100 shadow-lg"
      title={current.label}
    >
      <span className="font-semibold">Export Incident</span>
      <span className="opacity-70">· {current.label}</span>
      <button
        type="button"
        onClick={download}
        className="ml-1 inline-flex h-5 items-center gap-1 rounded px-1.5 hover:bg-white/15"
        aria-label="Export incident TXT"
      >
        <Download className="h-3 w-3" /> .txt
      </button>
    </div>
  );
}
