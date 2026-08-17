import { supabase } from '@/integrations/supabase/client';
import type { YahtzeeState } from './yahtzeeTypes';

export interface YahtzeeRoundStartResult {
  outcome: 'started' | 'already_started';
  deduped: boolean;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
  state: YahtzeeState;
}

/**
 * Request the exact current Yahtzee bootstrap and consume its committed result.
 * Realtime synchronizes peers; it is never required for the caller to start.
 */
export async function startYahtzeeRound(
  gameId: string,
  isFirstHand = false,
  predecessorRoundId: string | null = null,
): Promise<YahtzeeRoundStartResult> {
  if (!isFirstHand && !predecessorRoundId) {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('current_game_uuid, total_hands')
      .eq('id', gameId)
      .single();
    if (gameError) throw gameError;
    if (!game.current_game_uuid || !Number.isInteger(game.total_hands)) {
      throw new Error('Yahtzee tie rollover has no exact current dealer-game identity');
    }
    const { data: predecessor, error: predecessorError } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId)
      .eq('dealer_game_id', game.current_game_uuid)
      .eq('hand_number', game.total_hands)
      .eq('status', 'completed')
      .maybeSingle();
    if (predecessorError) throw predecessorError;
    if (!predecessor) {
      throw new Error('Yahtzee tie rollover requires the exact completed predecessor round');
    }
    predecessorRoundId = predecessor.id;
  }
  const { data, error } = await (supabase as any).rpc('start_yahtzee_round', {
    _game_id: gameId,
    _predecessor_round_id: isFirstHand ? null : predecessorRoundId,
  });
  if (error) throw error;
  if (data?.outcome === 'rejected') {
    throw new Error(String(data.reason ?? 'Yahtzee round bootstrap rejected'));
  }
  if (data?.outcome !== 'started' && data?.outcome !== 'already_started') {
    throw new Error(`Unexpected Yahtzee bootstrap outcome: ${data?.outcome ?? 'missing'}`);
  }
  if (!data.round_id || !data.dealer_game_id || !Number.isInteger(data.hand_number) || !data.state) {
    throw new Error('Yahtzee bootstrap returned an incomplete committed result');
  }
  return {
    outcome: data.outcome,
    deduped: Boolean(data.deduped),
    roundId: String(data.round_id),
    dealerGameId: String(data.dealer_game_id),
    handNumber: Number(data.hand_number),
    state: data.state as YahtzeeState,
  };
}
