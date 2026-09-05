import { supabase } from '@/integrations/supabase/client';
import type { CribbageState } from './cribbageTypes';

export async function advanceCribbagePostgame(identity: {
  gameId: string; roundId: string; dealerGameId: string; handNumber: number;
}): Promise<{ outcome: 'advanced' | 'already_advanced' | 'stale_identity'; status: string }> {
  const { data, error } = await (supabase as any).rpc('cribbage_advance_postgame', {
    _game_id: identity.gameId, _round_id: identity.roundId,
    _dealer_game_id: identity.dealerGameId, _hand_number: identity.handNumber,
  });
  if (error) throw error;
  if (!['advanced', 'already_advanced', 'stale_identity'].includes(data?.outcome)) {
    throw new Error('Cribbage postgame returned no authoritative disposition');
  }
  return data;
}

export async function fetchCribbageState(
  roundId: string,
  signal?: AbortSignal,
): Promise<CribbageState> {
  let request = (supabase as any).rpc('cribbage_get_state', {
    _round_id: roundId,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  if (!data) throw new Error('Cribbage authority returned no state');
  return data as CribbageState;
}

export async function prepareCribbageDealerSelection(gameId: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc('cribbage_prepare_dealer_selection', {
    _game_id: gameId,
  });
  if (error) throw error;
  if (data?.outcome === 'rejected') {
    throw new Error(String(data.reason ?? 'Cribbage dealer selection rejected'));
  }
}

export async function beginCribbageDealerSelection(gameId: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc('cribbage_begin_dealer_selection', {
    _game_id: gameId,
  });
  if (error) throw error;
  if (data?.outcome === 'rejected') {
    throw new Error(String(data.reason ?? 'Cribbage dealer-selection entry rejected'));
  }
}

export async function applyCribbagePeggingAction(args: {
  roundId: string;
  playerId: string;
  action: 'play' | 'go' | 'auto';
  cardIndex?: number | null;
  expectedEventSequence?: number | null;
  signal?: AbortSignal;
}): Promise<{ outcome: string; state?: CribbageState; event_sequence?: number }> {
  let request = (supabase as any).rpc('cribbage_apply_pegging_action', {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _action: args.action,
    _card_index: args.cardIndex ?? null,
    _expected_event_sequence: args.expectedEventSequence ?? null,
  });
  if (args.signal) request = request.abortSignal(args.signal);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? { outcome: 'unknown' }) as {
    outcome: string;
    state?: CribbageState;
    event_sequence?: number;
  };
}
