import { supabase } from '@/integrations/supabase/client';
import type { GinRummyCard, GinRummyState } from './ginRummyTypes';

type GinAuthorityResult = {
  outcome?: string;
  round_id?: string;
  hand_number?: number;
  state?: GinRummyState | null;
  reason?: string;
};

export type GinRummyAuthorityAction =
  | 'take_first_draw'
  | 'pass_first_draw'
  | 'draw_stock'
  | 'draw_discard'
  | 'discard'
  | 'knock'
  | 'lay_off'
  | 'finish_lay_off'
  | 'finalize_scoring';

function requireState(result: GinAuthorityResult | null, operation: string): GinRummyState {
  if (!result?.state) {
    throw new Error(`${operation} returned no authoritative Gin state (${result?.outcome ?? 'missing outcome'})`);
  }
  return result.state;
}

/**
 * Atomically validates ante admission, creates exact H1, publishes in_progress,
 * and returns the committed caller projection. Realtime is reconciliation only.
 */
export async function startGinRummyRound(
  gameId: string,
  _preloaded?: unknown,
): Promise<{ success: true; roundId: string; handNumber: number; round: any }> {
  const { data, error } = await supabase.rpc('start_gin_rummy_initial_hand' as any, {
    _game_id: gameId,
  } as any);
  if (error) throw error;

  const result = data as GinAuthorityResult | null;
  if (result?.outcome === 'rejected') {
    throw new Error(`Gin bootstrap rejected: ${result.reason ?? 'unknown reason'}`);
  }
  if ((result?.outcome !== 'started' && result?.outcome !== 'already_started') || !result.round_id) {
    throw new Error(`Unexpected Gin bootstrap outcome: ${result?.outcome ?? 'missing'}`);
  }

  const state = requireState(result, 'Gin bootstrap');
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', result.round_id)
    .single();
  if (roundError || !round) throw roundError ?? new Error('Gin bootstrap round was not queryable');

  return {
    success: true,
    roundId: result.round_id,
    handNumber: result.hand_number ?? round.hand_number ?? 1,
    round: { ...round, gin_rummy_state: state },
  };
}

export async function startNextGinRummyHand(
  predecessorRoundId: string,
): Promise<{
  success: true;
  roundId: string;
  handNumber: number;
  newState: GinRummyState;
  alreadyStarted: boolean;
}> {
  const { data, error } = await supabase.rpc('gin_rummy_start_next_hand' as any, {
    _predecessor_round_id: predecessorRoundId,
  } as any);
  if (error) throw error;
  const result = data as GinAuthorityResult | null;
  if (result?.outcome === 'stale_identity') {
    throw new Error('Gin successor request targeted a stale hand identity');
  }
  if ((result?.outcome !== 'started' && result?.outcome !== 'already_started') || !result.round_id) {
    throw new Error(`Unexpected Gin successor outcome: ${result?.outcome ?? 'missing'}`);
  }
  return {
    success: true,
    roundId: result.round_id,
    handNumber: result.hand_number ?? 1,
    newState: requireState(result, 'Gin successor'),
    alreadyStarted: result.outcome === 'already_started',
  };
}

export async function applyGinRummyAction(args: {
  roundId: string;
  playerId: string;
  action: GinRummyAuthorityAction;
  card?: GinRummyCard | null;
  meldIndex?: number | null;
  expectedActionCount?: number | null;
}): Promise<{ outcome: string; state: GinRummyState }> {
  const { data, error } = await supabase.rpc('gin_rummy_apply_action' as any, {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _action: args.action,
    _card: args.card ?? null,
    _meld_index: args.meldIndex ?? null,
    _expected_action_count: args.expectedActionCount ?? null,
  } as any);
  if (error) throw error;
  const result = data as GinAuthorityResult | null;
  if (result?.outcome === 'stale_identity') {
    throw new Error('Gin action targeted a stale hand identity');
  }
  return {
    outcome: result?.outcome ?? 'missing',
    state: requireState(result, 'Gin action'),
  };
}

export async function fetchGinRummyState(roundId: string): Promise<GinRummyState> {
  const { data, error } = await supabase.rpc('gin_rummy_get_state' as any, {
    _round_id: roundId,
  } as any);
  if (error) throw error;
  if (!data) throw new Error('Gin state RPC returned no projection');
  return data as unknown as GinRummyState;
}
