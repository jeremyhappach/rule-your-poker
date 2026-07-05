/**
 * Static re-entrancy guard proof.
 *
 * Verifies that `isInstrumentationRequest` classifies every known
 * chat-operation instrumentation RPC/table as instrumentation (→ NO
 * SUPABASE_FETCH_* boundary events emitted) while all business
 * Supabase calls (chat_messages insert, players/games/sessions reads,
 * auth token refresh, generic RPCs) remain captured.
 */
import { describe, it, expect } from 'vitest';
import { isInstrumentationRequest } from './chatOperationBoundary';

const INSTRUMENTATION_RPCS = [
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
];
const INSTRUMENTATION_TABLES = ['chat_send_operations', 'chat_operation_reports'];

const BUSINESS_RPCS = [
  'get_game_state', 'process_hand_end', 'refresh_session', 'has_role',
];
const BUSINESS_TABLES = [
  'chat_messages', 'players', 'games', 'game_sessions',
  'dealer_games', 'player_cards', 'user_roles',
];

describe('re-entrancy guard: isInstrumentationRequest', () => {
  it('classifies every instrumentation RPC as instrumentation', () => {
    for (const rpc of INSTRUMENTATION_RPCS) {
      expect(isInstrumentationRequest('rpc', rpc)).toBe(true);
    }
  });
  it('classifies every instrumentation REST table as instrumentation', () => {
    for (const tbl of INSTRUMENTATION_TABLES) {
      expect(isInstrumentationRequest('rest', tbl)).toBe(true);
    }
  });
  it('classifies business RPCs as NON-instrumentation (still captured)', () => {
    for (const rpc of BUSINESS_RPCS) {
      expect(isInstrumentationRequest('rpc', rpc)).toBe(false);
    }
  });
  it('classifies business tables as NON-instrumentation (still captured)', () => {
    for (const tbl of BUSINESS_TABLES) {
      expect(isInstrumentationRequest('rest', tbl)).toBe(false);
    }
  });
  it('never treats an unclassifiable request as instrumentation', () => {
    expect(isInstrumentationRequest('other', '')).toBe(false);
    expect(isInstrumentationRequest('other', 'chat_operation_append_boundary_event')).toBe(false);
  });
  it('cross-kind poisoning is rejected (table name in rpc slot, rpc name in rest slot)', () => {
    expect(isInstrumentationRequest('rpc', 'chat_send_operations')).toBe(false);
    expect(isInstrumentationRequest('rest', 'finalize_chat_send_operation')).toBe(false);
  });
});
