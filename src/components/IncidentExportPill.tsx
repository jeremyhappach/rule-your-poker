import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getClientInstanceId, recordRuntimeEvent } from '@/lib/runtimeInstrumentation/runtimeTracer';

const SESSION_START_ISO = new Date().toISOString();
const SESSION_TOKEN = `normal-shell-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

type IncidentKind = 'chat_send' | 'voice_operation';

interface CurrentIncident {
  kind: IncidentKind;
  operationId: string;
  gameId: string;
  sessionId: string;
  route: string;
  senderUserId: string | null;
  senderClientInstanceId?: string | null;
  terminalStatus: string;
  startedAt: string;
  finalizedAt: string;
  reportText: string;
  label: string;
}

function extractRouteGameId(pathname: string): string | null {
  const m = pathname.match(/\/game\/([0-9a-f-]{8,})/i);
  return m ? m[1] : null;
}

function normalSessionIdForGame(gameId: string | null): string | null {
  return gameId ? `session:${gameId}` : null;
}

function shortId(id: string): string {
  return id.replace(/^chat-/, '').replace(/^voice-/, '').slice(0, 8);
}

function startedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isForbiddenValue(value: string | null | undefined): boolean {
  const v = (value ?? '').toLowerCase();
  return v.includes('synthetic') || v.includes('self_check') || v.includes('self-check') ||
    v.includes('recovery_probe') || v.includes('recovery-probe') || v.includes('runtime_only') ||
    v.includes('runtime-only');
}

function emitInvalid(reason: string, payload: Record<string, unknown>): void {
  recordRuntimeEvent({
    event_family: 'incident_export',
    event_name: 'NORMAL_INCIDENT_PILL_INVALID_REPORT',
    severity: 'warn',
    payload: { reason, ...payload },
  });
}

function validateIncident(
  incident: CurrentIncident,
  routeGameId: string | null,
  routeSessionId: string | null,
): boolean {
  const invalid = (reason: string) => {
    emitInvalid(reason, {
      type: incident.kind,
      operationId: incident.operationId,
      gameId: incident.gameId,
      sessionId: incident.sessionId,
      route: incident.route,
      createdAt: incident.finalizedAt,
      sessionStart: SESSION_START_ISO,
      routeGameId,
      routeSessionId,
    });
    return false;
  };

  if (incident.kind !== 'chat_send' && incident.kind !== 'voice_operation') return invalid('forbidden-type');
  if (isForbiddenValue(incident.operationId) || isForbiddenValue(incident.terminalStatus)) return invalid('synthetic-or-self-check');
  if (!incident.gameId || !incident.sessionId) return invalid('missing-game-or-session');
  if (!incident.route || incident.route === '/') return invalid('root-route');
  if (new Date(incident.finalizedAt).getTime() < new Date(SESSION_START_ISO).getTime()) return invalid('predates-session');
  if (!routeGameId || incident.gameId !== routeGameId) return invalid('game-mismatch');
  if (!routeSessionId || incident.sessionId !== routeSessionId) return invalid('session-mismatch');
  if (!incident.route.includes(routeGameId)) return invalid('route-mismatch');
  return true;
}

export function IncidentExportPill(): JSX.Element | null {
  const location = useLocation();
  const routeGameId = useMemo(() => extractRouteGameId(location.pathname), [location.pathname]);
  const routeSessionId = useMemo(() => normalSessionIdForGame(routeGameId), [routeGameId]);
  const [userId, setUserId] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentIncident | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const exportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCurrent(null);
  }, [routeGameId, routeSessionId]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setCurrent(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const offer = (incident: CurrentIncident) => {
    if (dismissedRef.current.has(incident.operationId) || exportedRef.current.has(incident.operationId)) return;
    if (!validateIncident(incident, routeGameId, routeSessionId)) {
      setCurrent((prev) => (prev?.operationId === incident.operationId ? null : prev));
      return;
    }
    setCurrent((prev) => {
      if (!prev) return incident;
      if (dismissedRef.current.has(prev.operationId) || exportedRef.current.has(prev.operationId)) return incident;
      return new Date(incident.finalizedAt) >= new Date(prev.finalizedAt) ? incident : prev;
    });
  };

  useEffect(() => {
    if (!userId || !routeGameId || !routeSessionId) return;
    let cancelled = false;

    const loadChat = async () => {
      const { data } = await supabase
        .from('chat_operation_reports')
        .select('operation_id, sender_user_id, game_id, session_id, terminal_status, report_text, report_json, finalized_at')
        .eq('game_id', routeGameId)
        .eq('session_id', routeSessionId)
        .gte('finalized_at', SESSION_START_ISO)
        .order('finalized_at', { ascending: false })
        .limit(5);
      if (cancelled) return;
      for (const row of data ?? []) {
        const json = (row.report_json ?? {}) as Record<string, unknown>;
        const route = String(json.route ?? '');
        const senderClientInstanceId = json.sender_client_instance_id as string | null | undefined;
        const isCreator = senderClientInstanceId === getClientInstanceId() || row.sender_user_id === userId;
        const peerMilestones = Array.isArray(json.peer_milestones) ? json.peer_milestones : [];
        if (!isCreator && peerMilestones.length === 0) continue;
        offer({
          kind: 'chat_send',
          operationId: row.operation_id,
          gameId: row.game_id,
          sessionId: row.session_id,
          route,
          senderUserId: row.sender_user_id,
          senderClientInstanceId,
          terminalStatus: row.terminal_status,
          startedAt: String(json.started_at ?? row.finalized_at),
          finalizedAt: row.finalized_at,
          reportText: row.report_text,
          label: `Export Chat Incident · ${shortId(row.operation_id)} · ${startedTime(String(json.started_at ?? row.finalized_at))}`,
        });
        break;
      }
    };

    void loadChat();
    const ch = supabase
      .channel(`normal-incident-chat-${routeGameId}-${SESSION_TOKEN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_operation_reports', filter: `game_id=eq.${routeGameId}` },
        () => { void loadChat(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId, routeGameId, routeSessionId]);

  useEffect(() => {
    if (!userId || !routeGameId || !routeSessionId) return;
    let cancelled = false;
    const loadVoice = async () => {
      if (current?.kind === 'chat_send') return;
      const { data } = await supabase
        .from('voice_operation_reports')
        .select('voice_operation_id, sender_user_id, game_id, terminal_status, report_text, report_json, finalized_at')
        .eq('game_id', routeGameId)
        .gte('finalized_at', SESSION_START_ISO)
        .order('finalized_at', { ascending: false })
        .limit(5);
      if (cancelled) return;
      for (const row of data ?? []) {
        const json = (row.report_json ?? {}) as Record<string, unknown>;
        const sessionId = String(json.session_id ?? '');
        const route = String(json.origin_route ?? json.route ?? '');
        if (sessionId !== routeSessionId) continue;
        offer({
          kind: 'voice_operation',
          operationId: row.voice_operation_id,
          gameId: row.game_id ?? '',
          sessionId,
          route,
          senderUserId: row.sender_user_id,
          terminalStatus: row.terminal_status,
          startedAt: String(json.started_at ?? row.finalized_at),
          finalizedAt: row.finalized_at,
          reportText: row.report_text,
          label: `Export Voice Incident · ${shortId(row.voice_operation_id)} · ${startedTime(String(json.started_at ?? row.finalized_at))}`,
        });
        break;
      }
    };
    void loadVoice();
    const ch = supabase
      .channel(`normal-incident-voice-${routeGameId}-${SESSION_TOKEN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_operation_reports', filter: `game_id=eq.${routeGameId}` },
        () => { void loadVoice(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId, routeGameId, routeSessionId, current?.kind]);

  if (!current) return null;
  if (!validateIncident(current, routeGameId, routeSessionId)) return null;

  const clear = () => {
    dismissedRef.current.add(current.operationId);
    setCurrent(null);
  };

  const download = () => {
    const blob = new Blob([current.reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.kind === 'chat_send' ? 'chat' : 'voice'}-incident-${current.operationId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    exportedRef.current.add(current.operationId);
    setCurrent(null);
  };

  return (
    <div
      role="status"
      data-normal-incident-export-pill=""
      data-incident-session-token={SESSION_TOKEN}
      data-incident-kind={current.kind}
      data-incident-operation-id={current.operationId}
      aria-label={`${current.label}; operation ${current.operationId}; started ${current.startedAt}; game ${current.gameId}; session ${current.sessionId}`}
      title={`${current.label}\nOperation: ${current.operationId}\nStarted: ${current.startedAt}`}
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
    >
      <span className="font-semibold">{current.kind === 'chat_send' ? 'Export Chat Incident' : 'Export Voice Incident'}</span>
      <span className="opacity-70">· {shortId(current.operationId)} · {startedTime(current.startedAt)}</span>
      <button
        type="button"
        onClick={download}
        className="ml-1 inline-flex h-5 items-center gap-1 rounded px-1.5 hover:bg-white/15"
        aria-label={`Download ${current.kind === 'chat_send' ? 'chat' : 'voice'} incident ${shortId(current.operationId)} TXT`}
      >
        <Download className="h-3 w-3" /> .txt
      </button>
      <button
        type="button"
        onClick={clear}
        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
        aria-label={`Dismiss incident ${shortId(current.operationId)}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
