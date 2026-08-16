import { supabase } from '@/integrations/supabase/client';
import type { CribbageState } from './cribbageTypes';

export async function fetchCribbageState(roundId: string): Promise<CribbageState> {
  const { data, error } = await (supabase as any).rpc('cribbage_get_state', {
    _round_id: roundId,
  });
  if (error) throw error;
  if (!data) throw new Error('Cribbage authority returned no state');
  return data as CribbageState;
}

export async function prepareCribbageDealerSelection(gameId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('cribbage_prepare_dealer_selection', {
    _game_id: gameId,
  });
  if (error) throw error;
}

export async function applyCribbagePeggingAction(args: {
  roundId: string;
  playerId: string;
  action: 'play' | 'go' | 'auto';
  cardIndex?: number | null;
  expectedEventSequence?: number | null;
}): Promise<{ outcome: string; state?: CribbageState; event_sequence?: number }> {
  const { data, error } = await (supabase as any).rpc('cribbage_apply_pegging_action', {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _action: args.action,
    _card_index: args.cardIndex ?? null,
    _expected_event_sequence: args.expectedEventSequence ?? null,
  });
  if (error) throw error;
  return (data ?? { outcome: 'unknown' }) as {
    outcome: string;
    state?: CribbageState;
    event_sequence?: number;
  };
}
