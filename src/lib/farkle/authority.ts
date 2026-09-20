import { supabase } from '@/integrations/supabase/client';
import { executeDiceRpc } from '@/lib/diceRequestRecovery';
import type { FarkleAction, FarkleReplay, FarkleScope, FarkleState } from './types';

export interface FarkleActionRequest {
  scope: FarkleScope;
  playerId: string;
  action: FarkleAction;
  expectedSequence: number;
  requestId: string;
  selection: number[];
}
export interface FarkleActionReceipt {
  outcome: 'applied' | 'stale_identity' | 'stale_action' | 'paused';
  deduped?: boolean;
  state: FarkleState;
  settlement?: Record<string, unknown> | null;
}

export function createFarkleActionRequest(scope: FarkleScope, playerId: string, state: FarkleState, action: FarkleAction, selection: readonly number[] = []): FarkleActionRequest {
  if (state._authorityScope !== scope.roundId) throw new Error('The Farkle round changed. Refresh the table.');
  return { scope: { ...scope }, playerId, action, expectedSequence: state.actionSequence,
    requestId: crypto.randomUUID(), selection: action === 'hold' ? [...selection].sort((a, b) => a - b) : [] };
}

/** Every transport retry uses the SAME request id, identity, sequence and selection. */
export async function applyFarkleAction(request: FarkleActionRequest): Promise<FarkleActionReceipt> {
  const result = await executeDiceRpc<FarkleActionReceipt>(supabase, 'farkle_apply_action', {
    p_round_id: request.scope.roundId, p_player_id: request.playerId, p_action: request.action,
    p_expected_sequence: request.expectedSequence, p_request_id: request.requestId, p_selection: request.selection,
  });
  if (!result || !['applied', 'stale_identity', 'stale_action', 'paused'].includes(result.outcome)
    || result.state?.version !== 1 || result.state._authorityScope !== request.scope.roundId) {
    throw new Error('The Farkle action returned a mismatched round. Refresh the table.');
  }
  return result;
}

export async function readFarkleReplay(scope: FarkleScope): Promise<FarkleReplay> {
  const { data, error } = await supabase.rpc('farkle_read_replay' as never, { p_round_id: scope.roundId } as never);
  if (error) throw error;
  const replay = data as unknown as FarkleReplay;
  if (replay?.contract !== 'farkle-replay/1' || replay.roundId !== scope.roundId || replay.dealerGameId !== scope.dealerGameId) {
    throw new Error('The Farkle replay returned a mismatched round.');
  }
  return replay;
}
