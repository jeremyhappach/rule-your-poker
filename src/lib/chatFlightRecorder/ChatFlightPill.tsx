import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  ChatFlightPillState,
  completeChatFlightRecorder,
  getChatFlightPillState,
  subscribeChatFlightPill,
} from '@/lib/chatFlightRecorder';

// -------- TXT report formatter (pure, no side effects) --------------------

interface DiagEvent {
  wall_clock_at: string;
  monotonic_ms: number | null;
  event_sequence: number;
  event_name: string;
  client_role: 'sender' | 'receiver';
  client_message_id: string | null;
  game_id: string | null;
  session_id: string | null;
  actor_user_id: string | null;
  source_file: string | null;
  source_function: string | null;
  reason: string | null;
  state_snapshot: Record<string, unknown> | null;
}

interface DurableMsg {
  client_message_id: string;
  id: string;
  user_id: string;
  created_at: string;
  has_content: boolean;
  message_length: number;
}

interface Report {
  session: {
    game_id: string;
    diagnostic_session_id: string;
    armed_at: string;
    expires_at: string;
  };
  events: DiagEvent[];
  durable_messages: DurableMsg[];
  exported_at: string;
  error?: string;
}

function pad(n: number, w = 2): string { return n.toString().padStart(w, '0'); }
function iso(ts: string | number | null | undefined): string {
  if (!ts) return '-';
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}
function shortId(id: string | null | undefined): string {
  if (!id) return '-';
  return id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
}

function classifyFirstBrokenBoundary(events: DiagEvent[], durable: DurableMsg[]): string {
  const durableSet = new Set(durable.map((m) => m.client_message_id));
  const senderEvents = events.filter((e) => e.client_role === 'sender');
  const receiverEvents = events.filter((e) => e.client_role === 'receiver');

  const hasSend = senderEvents.some((e) => /send|dispatch|intent/i.test(e.event_name));
  if (!hasSend) return 'no-send: sender never emitted a dispatch event';

  const optimistic = senderEvents.find((e) => /optimistic/i.test(e.event_name));
  if (!optimistic) return 'no-optimistic-add: sender did not emit an optimistic add';

  const insertOk = senderEvents.some((e) => /insert.*success|db.*success/i.test(e.event_name));
  const insertFail = senderEvents.some((e) => /insert.*fail|db.*fail|error/i.test(e.event_name));
  if (insertFail && !insertOk) return 'db-insert-failed';

  // Check any sender-emitted clientMessageId is durable.
  const senderMsgIds = new Set(senderEvents.map((e) => e.client_message_id).filter(Boolean) as string[]);
  const missingDurable = [...senderMsgIds].filter((id) => !durableSet.has(id));
  if (missingDurable.length > 0) return `no-durable-row for client_message_id(s): ${missingDurable.map(shortId).join(', ')}`;

  const admitted = receiverEvents.some((e) => /realtime.*admit|payload.*admit|receive/i.test(e.event_name));
  if (!admitted) return 'realtime-not-admitted on receiver';

  const removed = events.find((e) => /remove|replace|prune|drop/i.test(e.event_name));
  if (removed) return `store-mutation removed row: ${removed.event_name} reason=${removed.reason ?? '-'}`;

  return 'no-broken-boundary-detected';
}

function formatReportTxt(r: Report): string {
  const lines: string[] = [];
  const s = r.session;
  lines.push('CHAT FLIGHT REPORT');
  lines.push('==================');
  lines.push(`exported_at:            ${iso(r.exported_at)}`);
  lines.push(`game_id:                ${s.game_id}`);
  lines.push(`diagnostic_session_id:  ${s.diagnostic_session_id}`);
  lines.push(`armed_at:               ${iso(s.armed_at)}`);
  lines.push(`expires_at:             ${iso(s.expires_at)}`);
  lines.push(`event_count:            ${r.events.length}`);
  lines.push(`durable_message_count:  ${r.durable_messages.length}`);
  lines.push('');

  // Per-message summaries.
  const byMsg = new Map<string, DiagEvent[]>();
  for (const e of r.events) {
    const k = e.client_message_id ?? '__no_msg__';
    const arr = byMsg.get(k) ?? [];
    arr.push(e);
    byMsg.set(k, arr);
  }

  lines.push('=== PER-MESSAGE SUMMARIES ===');
  lines.push('');
  const messageIds = [...byMsg.keys()].filter((k) => k !== '__no_msg__');
  if (messageIds.length === 0) {
    lines.push('(no client_message_ids captured)');
    lines.push('');
  }
  for (const cmid of messageIds) {
    const evs = (byMsg.get(cmid) ?? []).slice().sort((a, b) => {
      const dt = new Date(a.wall_clock_at).getTime() - new Date(b.wall_clock_at).getTime();
      if (dt !== 0) return dt;
      return a.event_sequence - b.event_sequence;
    });
    const senderEvs = evs.filter((e) => e.client_role === 'sender');
    const receiverEvs = evs.filter((e) => e.client_role === 'receiver');
    const durable = r.durable_messages.find((m) => m.client_message_id === cmid);
    const senderIdentity = senderEvs[0]?.actor_user_id ?? '-';
    const receiverIdentities = [...new Set(receiverEvs.map((e) => e.actor_user_id).filter(Boolean))];

    lines.push(`--- client_message_id: ${cmid} ---`);
    lines.push(`  sender_user_id:       ${senderIdentity}`);
    lines.push(`  receiver_user_id(s):  ${receiverIdentities.length ? receiverIdentities.join(', ') : '(none)'}`);
    lines.push(`  durable_row_exists:   ${durable ? 'yes' : 'no'}`);
    if (durable) {
      lines.push(`    db_id:              ${durable.id}`);
      lines.push(`    db_created_at:      ${iso(durable.created_at)}`);
      lines.push(`    has_content:        ${durable.has_content}  length=${durable.message_length}`);
    }
    lines.push(`  first_broken_boundary: ${classifyFirstBrokenBoundary(evs, r.durable_messages)}`);
    lines.push('');
    lines.push(`  sender timeline (${senderEvs.length}):`);
    for (const e of senderEvs) {
      lines.push(`    ${iso(e.wall_clock_at)} seq=${e.event_sequence} ${e.event_name}` +
        `  src=${e.source_file ?? '-'}:${e.source_function ?? '-'}` +
        (e.reason ? `  reason=${e.reason}` : '') +
        (e.state_snapshot && Object.keys(e.state_snapshot).length
          ? `  state=${JSON.stringify(e.state_snapshot)}`
          : ''));
    }
    lines.push('');
    lines.push(`  receiver timeline (${receiverEvs.length}):`);
    for (const e of receiverEvs) {
      lines.push(`    ${iso(e.wall_clock_at)} seq=${e.event_sequence} ${e.event_name}` +
        `  src=${e.source_file ?? '-'}:${e.source_function ?? '-'}` +
        (e.reason ? `  reason=${e.reason}` : '') +
        (e.state_snapshot && Object.keys(e.state_snapshot).length
          ? `  state=${JSON.stringify(e.state_snapshot)}`
          : ''));
    }
    lines.push('');
  }

  lines.push('=== RAW EVENT LOG (chronological) ===');
  for (const e of r.events) {
    lines.push(
      `${iso(e.wall_clock_at)}  role=${e.client_role.padEnd(8)}` +
      ` seq=${pad(e.event_sequence, 3)}` +
      ` cmid=${shortId(e.client_message_id)}` +
      ` actor=${shortId(e.actor_user_id)}` +
      ` event=${e.event_name}` +
      `  src=${e.source_file ?? '-'}:${e.source_function ?? '-'}` +
      (e.reason ? `  reason=${e.reason}` : '') +
      (e.state_snapshot && Object.keys(e.state_snapshot).length
        ? `  state=${JSON.stringify(e.state_snapshot)}`
        : '')
    );
  }
  lines.push('');

  // Missing evidence.
  lines.push('=== MISSING EVIDENCE ===');
  const missing: string[] = [];
  if (r.events.length === 0) missing.push('no events at all');
  const rolesSeen = new Set(r.events.map((e) => e.client_role));
  if (!rolesSeen.has('sender')) missing.push('no sender events');
  if (!rolesSeen.has('receiver')) missing.push('no receiver events');
  if (r.durable_messages.length === 0 && messageIds.length > 0) {
    missing.push('no durable chat_messages rows for any captured client_message_id');
  }
  const senderMsgIds = new Set(
    r.events.filter((e) => e.client_role === 'sender').map((e) => e.client_message_id).filter(Boolean) as string[]
  );
  const durableSet = new Set(r.durable_messages.map((m) => m.client_message_id));
  for (const id of senderMsgIds) {
    if (!durableSet.has(id)) missing.push(`durable row missing for ${id}`);
  }
  if (missing.length === 0) lines.push('(none)');
  else for (const m of missing) lines.push(`- ${m}`);
  lines.push('');

  lines.push('=== POLICY NOTES ===');
  lines.push('- No message content is captured. Only lengths/hashes if provided in state_snapshot.');
  lines.push('- Server-side caps: 80 events per client_message_id, 3 sender client_message_ids per session, 15-minute window.');
  return lines.join('\n');
}

// -------- Component -------------------------------------------------------

export function ChatFlightPill() {
  const [state, setState] = useState<ChatFlightPillState>(() => getChatFlightPillState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Tick every second so the "expires_at" boundary flips the pill to READY.
    const iv = setInterval(() => setState(getChatFlightPillState()), 1000);
    const unsub = subscribeChatFlightPill(setState);
    return () => { clearInterval(iv); unsub(); };
  }, []);

  if (state.phase === 'idle' || !state.gameId || !state.diagnosticSessionId) {
    return null;
  }

  const isReady = state.phase === 'ready';
  const label = isReady
    ? 'CHAT FLIGHT · READY TO EXPORT'
    : `CHAT FLIGHT · ARMED · ${state.senderCountLocal}/${state.senderCap}`;

  const handleClick = async () => {
    setError(null);
    if (!isReady) {
      // Explicit completion: transition to READY (user can tap again to export).
      completeChatFlightRecorder();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_chat_flight_report', {
        _game_id: state.gameId!,
      });
      if (rpcError) throw new Error(rpcError.message);
      const report = (data ?? {}) as unknown as Report;
      if (report.error) throw new Error(report.error);
      const txt = formatReportTxt(report);
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp =
        `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
        `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
      const gId = state.gameId!.slice(0, 8);
      const dId = state.diagnosticSessionId!.slice(0, 8);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-flight-${gId}-${dId}-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        pointerEvents: 'auto',
      }}
      className={
        'flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold shadow-lg backdrop-blur ' +
        (isReady
          ? 'border-emerald-400/70 bg-emerald-950/90 text-emerald-100'
          : 'border-amber-400/70 bg-amber-950/90 text-amber-100')
      }
      title={`diagnostic_session_id=${state.diagnosticSessionId} game_id=${state.gameId}`}
      data-chat-flight-pill-phase={state.phase}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-1 disabled:opacity-60"
      >
        <span>{busy ? 'CHAT FLIGHT · EXPORTING…' : label}</span>
        {isReady && <Download className="h-3 w-3" />}
      </button>
      {error && <span className="text-red-300">{error}</span>}
    </div>
  );
}
