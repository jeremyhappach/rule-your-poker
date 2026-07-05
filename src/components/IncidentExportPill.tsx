import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { recordRuntimeEvent } from '@/lib/runtimeInstrumentation/runtimeTracer';
import {
  getCurrentSessionChatOperations,
  subscribeCurrentSessionChatOperations,
  type CurrentSessionChatOperationRecord,
} from '@/lib/chatOperations/serverChatOperation';

const SESSION_START_ISO = new Date().toISOString();
const SESSION_TOKEN = `normal-shell-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

interface CurrentChatIncident {
  operationId: string;
  gameId: string;
  sessionId: string;
  route: string;
  senderUserId: string | null;
  terminalStatus: string;
  startedAt: string;
  finalizedAt: string;
  reportText: string;
  snapshotCount: number;
  peerMilestoneCount: number;
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
  incident: CurrentChatIncident,
  operation: CurrentSessionChatOperationRecord | null,
  routeGameId: string | null,
  routeSessionId: string | null,
): boolean {
  const invalid = (reason: string) => {
    emitInvalid(reason, {
      type: 'chat_send',
      operationId: incident.operationId,
      gameId: incident.gameId,
      sessionId: incident.sessionId,
      route: incident.route,
      createdAt: incident.finalizedAt,
      sessionStart: SESSION_START_ISO,
      routeGameId,
      routeSessionId,
      observedOperation: operation,
    });
    return false;
  };

  if (!operation) return invalid('not-current-session-operation');
  if (operation.role !== 'sender' && operation.role !== 'peer') return invalid('invalid-current-session-role');
  if (!incident.operationId.startsWith('chat-')) return invalid('forbidden-type');
  if (isForbiddenValue(incident.operationId) || isForbiddenValue(incident.terminalStatus)) return invalid('synthetic-or-self-check');
  if (!incident.gameId || !incident.sessionId) return invalid('missing-game-or-session');
  if (!incident.route || incident.route === '/') return invalid('root-route');
  if (new Date(incident.finalizedAt).getTime() < new Date(SESSION_START_ISO).getTime()) return invalid('predates-session');
  if (!routeGameId || incident.gameId !== routeGameId) return invalid('game-mismatch');
  if (!routeSessionId || incident.sessionId !== routeSessionId) return invalid('session-mismatch');
  if (!incident.route.includes(routeGameId)) return invalid('route-mismatch');
  if (operation.gameId !== incident.gameId || operation.sessionId !== incident.sessionId) return invalid('operation-identity-mismatch');
  if (operation.route !== incident.route) return invalid('operation-route-mismatch');
  if (incident.peerMilestoneCount < 1) return invalid('missing-peer-milestone');
  if (incident.snapshotCount < 1) return invalid('missing-tab-attention-snapshot');
  if (!incident.reportText.startsWith('CHAT SEND INCIDENT REPORT')) return invalid('not-chat-report-text');
  return true;
}

export function IncidentExportPill(): JSX.Element | null {
  const location = useLocation();
  const routeGameId = useMemo(() => extractRouteGameId(location.pathname), [location.pathname]);
  const routeSessionId = useMemo(() => normalSessionIdForGame(routeGameId), [routeGameId]);
  const [trackedOps, setTrackedOps] = useState<CurrentSessionChatOperationRecord[]>(() => getCurrentSessionChatOperations());
  const [current, setCurrent] = useState<CurrentChatIncident | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const exportedRef = useRef<Set<string>>(new Set());

  const operationById = useMemo(() => {
    const map = new Map<string, CurrentSessionChatOperationRecord>();
    for (const op of trackedOps) map.set(op.operationId, op);
    return map;
  }, [trackedOps]);

  useEffect(() => {
    setCurrent(null);
  }, [routeGameId, routeSessionId]);

  useEffect(() => {
    const sync = () => setTrackedOps(getCurrentSessionChatOperations());
    sync();
    return subscribeCurrentSessionChatOperations(() => {
      sync();
    });
  }, []);

  const offer = useCallback((incident: CurrentChatIncident) => {
    if (dismissedRef.current.has(incident.operationId) || exportedRef.current.has(incident.operationId)) return;
    const operation = operationById.get(incident.operationId) ?? null;
    if (!validateIncident(incident, operation, routeGameId, routeSessionId)) {
      setCurrent((prev) => (prev?.operationId === incident.operationId ? null : prev));
      return;
    }
    setCurrent((prev) => {
      if (!prev) return incident;
      if (dismissedRef.current.has(prev.operationId) || exportedRef.current.has(prev.operationId)) return incident;
      return new Date(incident.finalizedAt) >= new Date(prev.finalizedAt) ? incident : prev;
    });
  }, [operationById, routeGameId, routeSessionId]);

  const loadChatReport = useCallback(async (operationId: string) => {
    if (!routeGameId || !routeSessionId) return;
    const operation = operationById.get(operationId);
    if (!operation) return;
    const { data } = await supabase
      .from('chat_operation_reports')
      .select('id, operation_id, sender_user_id, game_id, session_id, terminal_status, report_text, report_json, finalized_at')
      .eq('operation_id', operationId)
      .eq('game_id', routeGameId)
      .eq('session_id', routeSessionId)
      .maybeSingle();
    if (!data) return;
    const normalized = normalizeChatOperationReport(data as never);
    if (!normalized) {
      emitInvalid('normalizer-rejected', { operationId });
      return;
    }
    if (normalized.operationType !== 'chat_send') {
      emitInvalid('not-chat-send-report-json', { operationId, operationType: normalized.operationType });
      return;
    }
    offer({
      operationId: normalized.operationId,
      gameId: normalized.gameId,
      sessionId: normalized.sessionId,
      route: normalized.route,
      senderUserId: normalized.senderUserId,
      terminalStatus: normalized.terminalStatus,
      startedAt: normalized.startedAt,
      finalizedAt: normalized.finalizedAt,
      reportText: normalized.reportText,
      snapshotCount: normalized.snapshotCount,
      peerMilestoneCount: normalized.peerMilestoneCount,
    });
  }, [operationById, offer, routeGameId, routeSessionId]);


  useEffect(() => {
    if (!routeGameId || !routeSessionId) return;
    let cancelled = false;
    for (const op of trackedOps) {
      if (op.gameId === routeGameId && op.sessionId === routeSessionId) {
        void loadChatReport(op.operationId);
      }
    }
    const ch = supabase
      .channel(`normal-incident-chat-${routeGameId}-${SESSION_TOKEN}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_operation_reports', filter: `game_id=eq.${routeGameId}` },
        (payload) => {
          const row = payload.new as { operation_id?: string; session_id?: string } | null;
          if (!row?.operation_id || row.session_id !== routeSessionId) return;
          if (!operationById.has(row.operation_id)) return;
          if (!cancelled) void loadChatReport(row.operation_id);
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [loadChatReport, operationById, routeGameId, routeSessionId, trackedOps]);

  if (!current) return null;
  if (!validateIncident(current, operationById.get(current.operationId) ?? null, routeGameId, routeSessionId)) return null;

  const clear = () => {
    dismissedRef.current.add(current.operationId);
    setCurrent(null);
  };

  const download = () => {
    const blob = new Blob([current.reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-incident-${current.operationId}.txt`;
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
      data-incident-kind="chat_send"
      data-incident-operation-id={current.operationId}
      data-incident-snapshot-count={current.snapshotCount}
      data-incident-peer-milestone-count={current.peerMilestoneCount}
      aria-label={`Export Chat Incident; operation ${current.operationId}; started ${current.startedAt}; game ${current.gameId}; session ${current.sessionId}`}
      title={`Export Chat Incident\nOperation: ${current.operationId}\nStarted: ${current.startedAt}\nSnapshots: ${current.snapshotCount}`}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483646,
        maxWidth: '92vw',
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-2 rounded border border-amber-500/70 bg-card/95 px-3 py-1.5 text-[11px] text-card-foreground shadow-lg"
    >
      <span className="font-semibold text-amber-200">Export Chat Incident</span>
      <span className="opacity-70">· {shortId(current.operationId)} · {startedTime(current.startedAt)}</span>
      <button
        type="button"
        onClick={download}
        className="ml-1 inline-flex h-5 items-center gap-1 rounded px-1.5 hover:bg-accent"
        aria-label={`Download chat incident ${shortId(current.operationId)} TXT`}
      >
        <Download className="h-3 w-3" /> .txt
      </button>
      <button
        type="button"
        onClick={clear}
        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
        aria-label={`Dismiss incident ${shortId(current.operationId)}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
