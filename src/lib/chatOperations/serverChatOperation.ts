import { supabase } from '@/integrations/supabase/client';
import {
  getClientInstanceId,
  getTabSessionId,
  recordRuntimeEvent,
} from '@/lib/runtimeInstrumentation/runtimeTracer';
import type { ShellTabAttentionSnapshot } from '@/lib/shellTabAttention/shellTabAttentionInstrumentation';

export interface ChatOperationIdentity {
  gameId: string;
  sessionId: string;
  dealerGameId?: string | null;
  route: string;
  activeTab?: string | null;
  shellPhase?: string | null;
  originSurface?: string | null;
  // Extended waiting-table context (populated at operation-open from the
  // canonical shell — no nullable ambient inference).
  routeGameId?: string | null;
  canonicalShellGameId?: string | null;
  operationGameId?: string | null;
  rawGameType?: string | null;
  resolvedGameType?: string | null;
  gameTypeSource?: string | null;
  gameControllerPresent?: boolean | null;
  currentTurnPlayerId?: string | null;
  localTurnEligible?: boolean | null;
  waitingTableComponent?: string | null;
  activeGameComponent?: string | null;
  tabBarRenderKey?: string | null;
}

export interface OpenChatOperationInput extends ChatOperationIdentity {
  operationId: string;
  senderUserId: string;
  messagePreview: string;
}

export interface CurrentSessionChatOperationRecord {
  operationId: string;
  gameId: string;
  sessionId: string;
  route: string;
  role: 'sender' | 'peer';
  observedAt: string;
}

const CURRENT_SESSION_CHAT_OPERATION_EVENT = 'ptown-current-session-chat-operation';
const currentSessionChatOperations = new Map<string, CurrentSessionChatOperationRecord>();

function validCurrentSessionChatOperation(record: CurrentSessionChatOperationRecord): boolean {
  return Boolean(
    record.operationId &&
    record.operationId.startsWith('chat-') &&
    record.gameId &&
    record.sessionId &&
    record.route &&
    record.route !== '/',
  );
}

export function registerCurrentSessionChatOperation(
  record: Omit<CurrentSessionChatOperationRecord, 'observedAt'> & { observedAt?: string },
): void {
  const normalized: CurrentSessionChatOperationRecord = {
    ...record,
    observedAt: record.observedAt ?? new Date().toISOString(),
  };
  if (!validCurrentSessionChatOperation(normalized)) return;
  currentSessionChatOperations.set(normalized.operationId, normalized);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CURRENT_SESSION_CHAT_OPERATION_EVENT, { detail: normalized }));
  }
}

export function getCurrentSessionChatOperations(): CurrentSessionChatOperationRecord[] {
  return Array.from(currentSessionChatOperations.values());
}

export function subscribeCurrentSessionChatOperations(
  listener: (record: CurrentSessionChatOperationRecord) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const record = (event as CustomEvent<CurrentSessionChatOperationRecord>).detail;
    if (record) listener(record);
  };
  window.addEventListener(CURRENT_SESSION_CHAT_OPERATION_EVENT, handler);
  return () => window.removeEventListener(CURRENT_SESSION_CHAT_OPERATION_EVENT, handler);
}

export function createChatOperationId(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `chat-${raw}`;
}

export async function openServerChatOperation(input: OpenChatOperationInput): Promise<boolean> {
  const startedAt = new Date().toISOString();
  const route = input.route || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!input.gameId || !input.sessionId || !route || route === '/') {
    recordRuntimeEvent({
      event_family: 'chat',
      event_name: 'CHAT_SEND_OPERATION_OPEN_REJECTED',
      severity: 'warn',
      game_id: input.gameId || null,
      session_id: input.sessionId || null,
      route,
      payload: { reason: 'missing-normal-shell-identity', operationId: input.operationId },
    });
    return false;
  }

  const openingMilestone = {
    phase: 'OPENED',
    at: startedAt,
    actor_user_id: input.senderUserId,
    metadata: {
      route,
      active_tab: input.activeTab ?? null,
      shell_phase: input.shellPhase ?? null,
      sender_client_instance_id: getClientInstanceId(),
      sender_tab_session_id: getTabSessionId(),
    },
  };

  const { error } = await supabase.from('chat_send_operations').insert({
    operation_id: input.operationId,
    operation_type: 'chat_send',
    sender_user_id: input.senderUserId,
    sender_client_instance_id: getClientInstanceId(),
    sender_tab_session_id: getTabSessionId(),
    game_id: input.gameId,
    session_id: input.sessionId,
    dealer_game_id: input.dealerGameId ?? null,
    route,
    active_tab: input.activeTab ?? null,
    shell_phase: input.shellPhase ?? null,
    origin_surface: input.originSurface ?? null,
    message_preview: input.messagePreview.slice(0, 120),
    source_kind: 'real',
    sender_milestones: [openingMilestone],
    started_at: startedAt,
    // Extended waiting-table context
    route_game_id: input.routeGameId ?? null,
    canonical_shell_game_id: input.canonicalShellGameId ?? null,
    operation_game_id: input.operationGameId ?? input.gameId,
    raw_game_type: input.rawGameType ?? null,
    resolved_game_type: input.resolvedGameType ?? null,
    game_type_source: input.gameTypeSource ?? null,
    game_controller_present: input.gameControllerPresent ?? null,
    current_turn_player_id: input.currentTurnPlayerId ?? null,
    local_turn_eligible: input.localTurnEligible ?? null,
    waiting_table_component: input.waitingTableComponent ?? null,
    active_game_component: input.activeGameComponent ?? null,
    tab_bar_render_key: input.tabBarRenderKey ?? null,
  } as never);

  if (error) {
    recordRuntimeEvent({
      event_family: 'chat',
      event_name: 'CHAT_SEND_OPERATION_OPEN_FAILED',
      severity: 'warn',
      game_id: input.gameId,
      session_id: input.sessionId,
      route,
      payload: { operationId: input.operationId, message: error.message },
    });
    return false;
  }

  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'CHAT_SEND_OPERATION_OPENED_DURABLE',
    severity: 'info',
    correlation_id: input.operationId,
    game_id: input.gameId,
    session_id: input.sessionId,
    route,
    active_tab: input.activeTab ?? null,
    game_status: input.shellPhase ?? null,
    payload: { operationId: input.operationId },
  });
  registerCurrentSessionChatOperation({
    operationId: input.operationId,
    gameId: input.gameId,
    sessionId: input.sessionId,
    route,
    role: 'sender',
  });
  return true;
}

export async function appendChatSenderMilestone(
  operationId: string,
  phase: string,
  metadata: Record<string, unknown> = {},
  ids: { messageId?: string | null; optimisticMessageId?: string | null } = {},
): Promise<void> {
  try {
    await supabase.rpc('chat_operation_append_sender_milestone', {
      _operation_id: operationId,
      _phase: phase,
      _metadata: metadata as never,
      _message_id: ids.messageId ?? null,
      _optimistic_message_id: ids.optimisticMessageId ?? null,
    });
  } catch { /* best-effort evidence append */ }
}

export async function appendChatPeerMilestone(
  operationId: string,
  phase: string,
  metadata: Record<string, unknown> = {},
  messageId?: string | null,
  snapshots: ShellTabAttentionSnapshot[] = [],
): Promise<void> {
  try {
    await supabase.rpc('chat_operation_append_peer_milestone', {
      _operation_id: operationId,
      _phase: phase,
      _metadata: metadata as never,
      _message_id: messageId ?? null,
      _snapshots: snapshots as never,
    });
  } catch { /* best-effort evidence append */ }
}

/**
 * Immediate sender heartbeat — used at operation-open so a sender that
 * dies in the first 3 s still leaves durable presence evidence.
 */
export async function writeChatOperationSenderHeartbeat(
  operationId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_sender_heartbeat',
      { _operation_id: operationId, _metadata: { at: new Date().toISOString(), ...metadata } },
    );
  } catch { /* best-effort */ }
}

/**
 * Immediate peer heartbeat — used the moment a peer observes realtime
 * receipt so peer presence is durable even before the interval starts.
 */
export async function writeChatOperationPeerHeartbeat(
  operationId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_peer_heartbeat',
      { _operation_id: operationId, _metadata: { at: new Date().toISOString(), ...metadata } },
    );
  } catch { /* best-effort */ }
}

/**
 * Peer-side bounded visibility probe. A peer that observes a realtime
 * chat_messages INSERT may race ahead of the sender's durable
 * `chat_send_operations` row. This helper polls
 * `chat_operation_read_sender_presence` at 500 ms intervals for up to
 * `maxMs` (default 5 s) and resolves `true` the first time the row is
 * visible, or `false` when the window elapses. Never throws; never
 * gates message rendering or unread state — the caller MUST leave the
 * business projection untouched and only use the resolved boolean to
 * decide whether to attempt operation-scoped peer telemetry writes.
 */
export async function awaitPeerOperationVisibility(
  operationId: string,
  maxMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  // Fast path: probe once immediately.
  const probe = async (): Promise<boolean> => {
    try {
      const { data } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null }>)(
        'chat_operation_read_sender_presence',
        { _operation_id: operationId },
      );
      return Array.isArray(data) && data.length > 0;
    } catch { return false; }
  };
  if (await probe()) return true;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await probe()) return true;
  }
  return false;
}

/**
 * Mark the operation as delivery-confirmed and open the 30-second
 * observation window. Idempotent server-side (first caller wins for
 * delivery_confirmed_at/kind and observation_window_start_at).
 */
export async function markChatOperationDeliveryConfirmed(
  operationId: string,
  kind: 'sender-db-success' | 'peer-realtime-receipt',
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_mark_delivery_confirmed',
      { _operation_id: operationId, _kind: kind, _metadata: { at: new Date().toISOString(), ...metadata } },
    );
  } catch { /* best-effort */ }
}

/**
 * Append a waiting-table / shell violation onto the durable chat operation
 * record. Best-effort — never blocks the send path.
 */
export async function appendChatOperationViolation(
  operationId: string,
  name: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_append_violation',
      {
        _operation_id: operationId,
        _name: name,
        _metadata: metadata,
      },
    );
  } catch { /* best-effort */ }
}

/**
 * Invokes the server-side `finalize_chat_send_operation` RPC.
 *
 * OWNERSHIP CONTRACT: This function does NOT write any terminal
 * client-side attention snapshot. Terminal snapshots are strictly
 * owned by the client whose role produced them:
 *   - the sender client writes CHAT_OPERATION_TERMINAL_SNAPSHOT
 *     BEFORE calling this function on its own send-finalize path;
 *   - the peer client writes PEER_OPERATION_TERMINAL_SNAPSHOT
 *     BEFORE calling this function from its observation path.
 * If either terminal snapshot is missing, the exported TXT records
 * "missing client terminal snapshot" rather than fabricating one
 * from the server-side finalizer.
 */
export async function finalizeServerChatOperation(
  operationId: string,
  terminalStatus: string,
  terminalReason: string,
  snapshots: ShellTabAttentionSnapshot[] = [],
): Promise<void> {
  try {
    await supabase.rpc('finalize_chat_send_operation', {
      _operation_id: operationId,
      _terminal_status: terminalStatus,
      _terminal_reason: terminalReason,
      _extra_snapshots: snapshots as never,
    });
  } catch { /* finalizer is retried by later peer/sender milestones */ }
}
