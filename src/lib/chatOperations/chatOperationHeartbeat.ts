/**
 * Chat-operation heartbeat manager.
 *
 * While a chat operation is registered in the current-session registry:
 *  - the sender writes `chat_operation_sender_heartbeat` every 3 s;
 *  - a peer writes `chat_operation_peer_heartbeat` every 3 s AND reads
 *    `chat_operation_read_sender_presence` — if the sender heartbeat is
 *    stale >10 s while the peer remains healthy in the same game/session,
 *    the peer appends `PEER_SENDER_PRESENCE_LOST` and calls the existing
 *    server finalizer with terminal_status='sender-lost'.
 *
 * Hard bound: at most 30 s of heartbeating per operation.
 * Stops immediately when the operation is removed from the registry.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  appendChatPeerMilestone,
  finalizeServerChatOperation,
  getCurrentSessionChatOperations,
  subscribeCurrentSessionChatOperations,
  type CurrentSessionChatOperationRecord,
} from './serverChatOperation';

const HEARTBEAT_INTERVAL_MS = 3_000;
const SENDER_STALE_MS = 10_000;
const HARD_CAP_MS = 60_000;

interface HeartbeatState {
  operationId: string;
  role: 'sender' | 'peer';
  startedAt: number;
  timer: number;
  senderLostFired: boolean;
}

const active = new Map<string, HeartbeatState>();
let installed = false;

async function senderTick(state: HeartbeatState) {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_sender_heartbeat',
      { _operation_id: state.operationId, _metadata: { at: new Date().toISOString() } },
    );
  } catch { /* best-effort */ }
}

async function peerTick(state: HeartbeatState) {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_peer_heartbeat',
      { _operation_id: state.operationId, _metadata: { at: new Date().toISOString() } },
    );
  } catch { /* best-effort */ }
  // Stale detection
  if (state.senderLostFired) return;
  try {
    const { data } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: Array<{ status: string; terminal_status: string | null; last_sender_heartbeat_at: string | null; last_sender_event_at: string | null; last_peer_heartbeat_at: string | null; now_at: string }> | null }>)(
      'chat_operation_read_sender_presence',
      { _operation_id: state.operationId },
    );
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return;
    if (row.status === 'finalized' || row.terminal_status) { stopHeartbeat(state.operationId); return; }
    const nowMs = new Date(row.now_at).getTime();
    const hbMs = row.last_sender_heartbeat_at ? new Date(row.last_sender_heartbeat_at).getTime() : 0;
    const staleMs = nowMs - hbMs;
    if (hbMs > 0 && staleMs >= SENDER_STALE_MS) {
      state.senderLostFired = true;
      const metadata = {
        detected_at: new Date().toISOString(),
        stale_ms: staleMs,
        last_sender_event_at: row.last_sender_event_at,
        last_sender_heartbeat_at: row.last_sender_heartbeat_at,
        last_peer_heartbeat_at: row.last_peer_heartbeat_at,
        peer_route: typeof window !== 'undefined' ? window.location.pathname : null,
        peer_online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      };
      await appendChatPeerMilestone(state.operationId, 'PEER_SENDER_PRESENCE_LOST', metadata);
      await finalizeServerChatOperation(state.operationId, 'sender-lost', 'peer-detected-sender-heartbeat-stale', []);
      stopHeartbeat(state.operationId);
    }
  } catch { /* best-effort */ }
}

function startHeartbeat(op: CurrentSessionChatOperationRecord) {
  if (active.has(op.operationId)) return;
  const state: HeartbeatState = {
    operationId: op.operationId,
    role: op.role,
    startedAt: Date.now(),
    timer: 0,
    senderLostFired: false,
  };
  const tick = () => {
    if (Date.now() - state.startedAt >= HARD_CAP_MS) { stopHeartbeat(state.operationId); return; }
    if (state.role === 'sender') void senderTick(state);
    else void peerTick(state);
  };
  // Fire immediately, then on interval.
  tick();
  state.timer = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
  active.set(state.operationId, state);
}

function stopHeartbeat(operationId: string) {
  const s = active.get(operationId);
  if (!s) return;
  if (s.timer) window.clearInterval(s.timer);
  active.delete(operationId);
}

/**
 * Install the heartbeat manager. Idempotent. Bootstraps from the current
 * registry snapshot and subscribes to future registrations. Also polls the
 * registry every 5 s to notice removals (registry has no removal event).
 */
export function installChatOperationHeartbeats(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const op of getCurrentSessionChatOperations()) startHeartbeat(op);
  subscribeCurrentSessionChatOperations((op) => startHeartbeat(op));
  window.setInterval(() => {
    const known = new Set(getCurrentSessionChatOperations().map((o) => o.operationId));
    for (const id of Array.from(active.keys())) if (!known.has(id)) stopHeartbeat(id);
  }, 5_000);
}
