/**
 * Chat-operation instrumentation URL classifier.
 *
 * Pure module — MUST NOT import supabase or any runtime-only symbol.
 * Consumed by the fetch monkey-patch in `chatOperationBoundary.ts` to
 * implement the SUPABASE_FETCH_* re-entrancy guard, and by unit tests
 * to statically prove the guard registry.
 */

/**
 * Exact-match registry of chat-operation instrumentation RPCs. Any
 * outbound Supabase RPC whose name is in this set is treated as
 * INSTRUMENTATION and passed through the fetch wrapper WITHOUT
 * emitting SUPABASE_FETCH_* boundary events.
 */
export const INSTRUMENTATION_RPCS: ReadonlySet<string> = new Set([
  'chat_operation_append_boundary_event',
  'chat_operation_sender_heartbeat',
  'chat_operation_peer_heartbeat',
  'chat_operation_read_sender_presence',
  'chat_operation_append_sender_milestone',
  'chat_operation_append_peer_milestone',
  'chat_operation_mark_delivery_confirmed',
  'chat_operation_append_violation',
  'chat_operation_append_recovery_correlation',
  'finalize_chat_send_operation',
]);

/**
 * Exact-match registry of chat-operation instrumentation REST tables.
 * Same semantics as `INSTRUMENTATION_RPCS`.
 */
export const INSTRUMENTATION_TABLES: ReadonlySet<string> = new Set([
  'chat_send_operations',
  'chat_operation_reports',
]);

/**
 * Pure classifier — no shared mutable state. Safe under arbitrary
 * concurrency: two concurrent requests each independently classify
 * themselves from their own URL. An instrumentation write cannot be
 * miscounted as a business call even if it interleaves with one.
 */
export function isInstrumentationRequest(
  kind: 'rpc' | 'rest' | 'other',
  leafName: string,
): boolean {
  if (kind === 'rpc') return INSTRUMENTATION_RPCS.has(leafName);
  if (kind === 'rest') return INSTRUMENTATION_TABLES.has(leafName);
  return false;
}
