import { supabase } from '@/integrations/supabase/client';

export interface HolmPostgameResult {
  outcome: 'advanced' | 'already_advanced' | 'stale_identity';
  status: string;
  dealerPosition: number | null;
  configDeadline: string | null;
}

export async function advanceHolmPostgame(args: {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
}): Promise<HolmPostgameResult> {
  const { data, error } = await (supabase as any).rpc('holm_advance_postgame', {
    p_game_id: args.gameId,
    p_round_id: args.roundId,
    p_dealer_game_id: args.dealerGameId,
    p_hand_number: args.handNumber,
  });
  if (error) throw error;
  if (!data || !['advanced', 'already_advanced', 'stale_identity'].includes(data.outcome)) {
    throw new Error(`Unexpected Holm postgame outcome: ${data?.outcome ?? 'missing'}`);
  }
  return {
    outcome: data.outcome,
    status: String(data.status ?? ''),
    dealerPosition: data.dealer_position == null ? null : Number(data.dealer_position),
    configDeadline: data.config_deadline == null ? null : String(data.config_deadline),
  };
}
