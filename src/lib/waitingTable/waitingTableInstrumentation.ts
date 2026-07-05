/**
 * Waiting-table violation producers.
 *
 * Every producer:
 *   1. records a runtime event (client-side visibility);
 *   2. appends the violation to every currently-open chat_send_operation
 *      via chat_operation_append_violation, so the exported TXT for that
 *      operation carries the violation with a stable sequence number.
 *
 * Producers are the ONLY sanctioned emit sites for these event names.
 */

import { recordRuntimeEvent } from '@/lib/runtimeInstrumentation/runtimeTracer';
import { appendChatOperationViolation } from '@/lib/chatOperations/serverChatOperation';

export type WaitingTableViolationName =
  | 'WAITING_TABLE_GAME_TYPE_READ'
  | 'WAITING_TABLE_GAME_TYPE_NULL'
  | 'WAITING_TABLE_GAME_TYPE_FALLBACK_APPLIED'
  | 'WAITING_TABLE_GAME_CONTROLLER_LOOKUP'
  | 'WAITING_TABLE_GAME_CONTROLLER_MISSING'
  | 'WAITING_TABLE_CURRENT_TURN_LOOKUP'
  | 'WAITING_TABLE_CURRENT_TURN_MISSING'
  | 'WAITING_TABLE_CARDS_TAB_GAME_LOGIC_ENTERED'
  | 'WAITING_TABLE_CHAT_TAB_GAME_LOGIC_ENTERED'
  | 'WAITING_TABLE_UNSAFE_NON_NULL_ASSERTION_PATH'
  | 'WAITING_TABLE_EFFECT_DEPENDS_ON_UNRESOLVED_GAME_CONTEXT'
  | 'WAITING_TABLE_SELECTOR_THROW_OR_EMPTY_RESULT'
  | 'SHELL_TABBAR_REMOUNT_DURING_CHAT_OPERATION'
  | 'CHAT_AND_CARDS_ATTENTION_COLLISION'
  | 'TAB_COLOR_STATE_CHANGED_DURING_CHAT_OPERATION';

export interface WaitingTableViolationInput {
  sourceFile: string;
  sourceFunction: string;
  inputValues?: Record<string, unknown>;
  resolvedValues?: Record<string, unknown>;
  fallbackApplied?: string | null;
  renderContinuation?: 'render' | 'effect' | 'callback' | 'no-op' | null;
  remountRequested?: boolean;
  extra?: Record<string, unknown>;
}

// Active chat operation ids (registered by shellTabAttention on open/finalize).
const activeChatOps = new Set<string>();
export function registerActiveChatOperationForViolations(operationId: string): void {
  if (operationId) activeChatOps.add(operationId);
}
export function clearActiveChatOperationForViolations(operationId: string): void {
  activeChatOps.delete(operationId);
}
export function getActiveChatOperationsForViolations(): string[] {
  return Array.from(activeChatOps);
}

// Dedupe identical sequential violations from the same site per operation.
const lastViolationKey = new Map<string, string>();

export function recordWaitingTableViolation(
  name: WaitingTableViolationName,
  input: WaitingTableViolationInput,
): void {
  const metadata = {
    source_file: input.sourceFile,
    source_function: input.sourceFunction,
    input_values: input.inputValues ?? {},
    resolved_values: input.resolvedValues ?? {},
    fallback_applied: input.fallbackApplied ?? null,
    render_continuation: input.renderContinuation ?? null,
    remount_requested: Boolean(input.remountRequested),
    ...(input.extra ?? {}),
  };

  const severity: 'warn' | 'info' =
    name === 'WAITING_TABLE_GAME_TYPE_READ' ||
    name === 'WAITING_TABLE_GAME_CONTROLLER_LOOKUP' ||
    name === 'WAITING_TABLE_CURRENT_TURN_LOOKUP'
      ? 'info'
      : 'warn';

  recordRuntimeEvent({
    event_family: 'shell_tab_attention',
    event_name: name,
    severity,
    payload: metadata,
  });

  for (const opId of activeChatOps) {
    const key = `${opId}:${name}:${input.sourceFile}:${input.sourceFunction}:${JSON.stringify(input.resolvedValues ?? {})}`;
    if (lastViolationKey.get(opId) === key) continue;
    lastViolationKey.set(opId, key);
    void appendChatOperationViolation(opId, name, metadata);
  }
}
