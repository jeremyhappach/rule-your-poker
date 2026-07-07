// Chat Message Flight Recorder — bounded, fire-and-forget.
//
// This module is instrumentation-only. It:
//   • never awaits from the send/receive path
//   • never throws
//   • never mutates React state
//   • never touches localStorage
//   • never uses cron, polling, heartbeats, global fetch/history patches,
//     retry workers, or background jobs
//   • silently drops evidence if the arming/session/message caps have
//     been reached or if the DB call fails.
//
// Enablement is a single row in `system_settings`:
//   key   = 'chat_flight_recorder'
//   value = { enabled: true, game_id: <uuid>, expires_at: <iso> }
// Server-side caps: 3 sender client_message_ids per diagnostic_session,
// 80 events per client_message_id, 15-minute window (expires_at).
//
// Client-side we additionally short-circuit before the RPC when a
// per-message cap has been reached in-memory, so a hot loop cannot
// stampede the RPC while the server is silently dropping.

import { supabase } from '@/integrations/supabase/client';
import { generateUUID } from '@/lib/uuid';

export type ChatFlightRole = 'sender' | 'receiver';

export interface ChatFlightEmitInput {
  clientMessageId?: string | null;
  gameId?: string | null;
  sessionId?: string | null;
  role: ChatFlightRole;
  eventName: string;
  sourceFile?: string;
  sourceFunction?: string;
  reason?: string;
  stateSnapshot?: Record<string, unknown>;
}

interface ArmingSnapshot {
  enabled: boolean;
  gameId: string | null;
  expiresAt: number | null; // epoch ms
}

const CFG_KEY = 'chat_flight_recorder';
const ARMING_TTL_MS = 15_000; // refresh at most every 15s
const PER_MSG_CAP = 80;
const PER_SESSION_SENDER_MSG_CAP = 3;

const diagnosticSessionId = generateUUID();
const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

let armingCache: ArmingSnapshot | null = null;
let armingFetchedAt = 0;
let armingInflight: Promise<ArmingSnapshot> | null = null;

const perMessageSeq = new Map<string, number>();
const perMessageCount = new Map<string, number>();
const senderMessageIds = new Set<string>();

function monotonicMs(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - t0;
}

async function fetchArming(): Promise<ArmingSnapshot> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', CFG_KEY)
      .maybeSingle();
    const v = (data?.value ?? {}) as {
      enabled?: boolean; game_id?: string | null; expires_at?: string | null;
    };
    const expiresAtIso = v.expires_at ?? null;
    return {
      enabled: v.enabled === true,
      gameId: v.game_id ?? null,
      expiresAt: expiresAtIso ? Date.parse(expiresAtIso) : null,
    };
  } catch {
    return { enabled: false, gameId: null, expiresAt: null };
  }
}

function getArming(): Promise<ArmingSnapshot> {
  const now = Date.now();
  if (armingCache && now - armingFetchedAt < ARMING_TTL_MS) {
    return Promise.resolve(armingCache);
  }
  if (armingInflight) return armingInflight;
  armingInflight = fetchArming().then((snap) => {
    armingCache = snap;
    armingFetchedAt = Date.now();
    armingInflight = null;
    return snap;
  }).catch(() => {
    armingInflight = null;
    const fallback: ArmingSnapshot = { enabled: false, gameId: null, expiresAt: null };
    armingCache = fallback;
    armingFetchedAt = Date.now();
    return fallback;
  });
  return armingInflight;
}

function isArmedForGame(snap: ArmingSnapshot, gameId: string | null | undefined): boolean {
  if (!snap.enabled) return false;
  if (snap.expiresAt && Date.now() > snap.expiresAt) return false;
  if (snap.gameId && gameId && snap.gameId !== gameId) return false;
  return true;
}

/**
 * Fire-and-forget event emission. Never awaited by callers. Never throws.
 * Silently caps at PER_MSG_CAP events per client_message_id and
 * PER_SESSION_SENDER_MSG_CAP distinct sender client_message_ids.
 */
export function emitChatFlightEvent(input: ChatFlightEmitInput): void {
  try {
    const {
      clientMessageId = null,
      gameId = null,
      sessionId = null,
      role,
      eventName,
      sourceFile,
      sourceFunction,
      reason,
      stateSnapshot,
    } = input;

    // Client-side sender-message cap (defense in depth).
    if (role === 'sender' && clientMessageId) {
      if (!senderMessageIds.has(clientMessageId)) {
        if (senderMessageIds.size >= PER_SESSION_SENDER_MSG_CAP) return;
        senderMessageIds.add(clientMessageId);
      }
    }

    if (clientMessageId) {
      const c = perMessageCount.get(clientMessageId) ?? 0;
      if (c >= PER_MSG_CAP) return;
      perMessageCount.set(clientMessageId, c + 1);
    }

    const seq = (perMessageSeq.get(clientMessageId ?? '__no_msg__') ?? 0) + 1;
    perMessageSeq.set(clientMessageId ?? '__no_msg__', seq);

    // Kick the arming check and RPC off the microtask queue so the
    // caller's setState (and the surrounding React commit) return
    // synchronously. Never awaited.
    void getArming().then((snap) => {
      if (!isArmedForGame(snap, gameId)) return;
      return supabase.rpc('record_chat_flight_event', {
        _diagnostic_session_id: diagnosticSessionId,
        _client_message_id: clientMessageId,
        _game_id: gameId,
        _session_id: sessionId,
        _client_role: role,
        _event_sequence: seq,
        _monotonic_ms: monotonicMs(),
        _event_name: eventName,
        _source_file: sourceFile ?? null,
        _source_function: sourceFunction ?? null,
        _reason: reason ?? null,
        _state_snapshot: (stateSnapshot ?? {}) as never,
      });
    }).catch(() => { /* silently drop */ });
  } catch {
    /* silently drop */
  }
}

export function chatFlightRecorderDiagnosticSessionId(): string {
  return diagnosticSessionId;
}
