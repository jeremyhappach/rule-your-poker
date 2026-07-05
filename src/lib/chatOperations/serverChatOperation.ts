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
  });

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
