// Chat Message Flight Recorder — bounded, fire-and-forget, auto-armed per game.
//
// Model:
//   • One diagnostic_session_id per game_id (durable row in
//     public.chat_diagnostic_sessions), created on first ensureArmedFor call.
//   • Auto-armed for 15 minutes from creation. No manual toggle. No
//     system_settings row.
//   • Server RPC gates on that row; caps (80 events/msg, 3 sender msgs/session)
//     enforced server-side and mirrored client-side.
//
// Isolation guarantees:
//   • never awaits from the send/receive path
//   • never throws
//   • never mutates React state directly (subscribers opt in)
//   • never touches localStorage
//   • no cron, polling, heartbeats, retries, global listeners,
//     fetch monkeypatches, or chat-operation telemetry revival.

import { supabase } from '@/integrations/supabase/client';

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

export type ChatFlightPillPhase =
  | 'idle'          // no armed session
  | 'armed'         // armed, count < cap, not expired
  | 'ready';        // ≥3 sender attempts on this client, expired, or explicit completion

export interface ChatFlightPillState {
  phase: ChatFlightPillPhase;
  senderCountLocal: number;   // sender attempts observed by THIS client
  senderCap: number;
  gameId: string | null;
  diagnosticSessionId: string | null;
  armedAt: number | null;
  expiresAt: number | null;
}

const PER_MSG_CAP = 80;
const PER_SESSION_SENDER_MSG_CAP = 3;

const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

interface ArmedSession {
  gameId: string;
  diagnosticSessionId: string;
  armedAt: number;
  expiresAt: number;
}

let armed: ArmedSession | null = null;
let armInflightGameId: string | null = null;

// Per-message local caps.
const perMessageSeq = new Map<string, number>();
const perMessageCount = new Map<string, number>();

// Local sender attempts observed on this client (unique client_message_ids).
const localSenderMessageIds = new Set<string>();
let explicitCompletion = false;

const subscribers = new Set<(s: ChatFlightPillState) => void>();

function monotonicMs(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - t0;
}

function computePhase(): ChatFlightPillPhase {
  if (!armed) return 'idle';
  if (explicitCompletion) return 'ready';
  if (Date.now() > armed.expiresAt) return 'ready';
  if (localSenderMessageIds.size >= PER_SESSION_SENDER_MSG_CAP) return 'ready';
  return 'armed';
}

function snapshot(): ChatFlightPillState {
  return {
    phase: computePhase(),
    senderCountLocal: localSenderMessageIds.size,
    senderCap: PER_SESSION_SENDER_MSG_CAP,
    gameId: armed?.gameId ?? null,
    diagnosticSessionId: armed?.diagnosticSessionId ?? null,
    armedAt: armed?.armedAt ?? null,
    expiresAt: armed?.expiresAt ?? null,
  };
}

function notify(): void {
  const s = snapshot();
  for (const cb of subscribers) {
    try { cb(s); } catch { /* swallow */ }
  }
}

export function subscribeChatFlightPill(cb: (s: ChatFlightPillState) => void): () => void {
  subscribers.add(cb);
  try { cb(snapshot()); } catch { /* swallow */ }
  return () => { subscribers.delete(cb); };
}

export function getChatFlightPillState(): ChatFlightPillState {
  return snapshot();
}

/**
 * Auto-arm for a specific game_id. Idempotent per game. If the same gameId is
 * already armed, this is a no-op. Switching gameId clears stale local counters
 * so no prior-session recorder state leaks into the new session.
 *
 * Fire-and-forget: never awaited by callers.
 */
export function ensureChatFlightRecorderArmed(_gameId: string | null | undefined): void {
  // Auto-arming disabled per containment. Schema/export code remain
  // available for exporting previously captured evidence, but no new
  // arming, event emission, or visible pill will occur.
  return;
}

/** Mark the pill READY due to explicit user action. */
export function completeChatFlightRecorder(): void {
  if (!armed) return;
  explicitCompletion = true;
  notify();
}

export function chatFlightRecorderDiagnosticSessionId(): string | null {
  return armed?.diagnosticSessionId ?? null;
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

    // No armed session? Drop silently. (Still track sender-count locally
    // in case arming resolves mid-flight — but only when armed for gameId.)
    if (!armed || (gameId && armed.gameId !== gameId)) return;
    if (Date.now() > armed.expiresAt) return;

    // Client-side sender-message cap + pill counter.
    if (role === 'sender' && clientMessageId) {
      if (!localSenderMessageIds.has(clientMessageId)) {
        if (localSenderMessageIds.size >= PER_SESSION_SENDER_MSG_CAP) return;
        localSenderMessageIds.add(clientMessageId);
        notify();
      }
    }

    if (clientMessageId) {
      const c = perMessageCount.get(clientMessageId) ?? 0;
      if (c >= PER_MSG_CAP) return;
      perMessageCount.set(clientMessageId, c + 1);
    }

    const seq = (perMessageSeq.get(clientMessageId ?? '__no_msg__') ?? 0) + 1;
    perMessageSeq.set(clientMessageId ?? '__no_msg__', seq);

    const diagnosticSessionId = armed.diagnosticSessionId;

    // Kick RPC off the microtask queue.
    void Promise.resolve().then(() =>
      supabase.rpc('record_chat_flight_event', {
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
      })
    ).catch(() => { /* silently drop */ });
  } catch {
    /* silently drop */
  }
}
