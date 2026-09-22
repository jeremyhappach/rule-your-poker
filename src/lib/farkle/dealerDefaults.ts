import { supabase } from '@/integrations/supabase/client';
import type { FarkleEndgame, FarkleRules } from './types';

export interface FarkleAdminDefaults {
  ante_amount: number;
  points_to_win: number;
  decision_timer_seconds: number;
  bot_decision_delay_seconds: number;
  farkle_rules: { scoring: FarkleRules; endgame: FarkleEndgame; botPolicy: 'balanced'; botBankThreshold: number };
}

export async function loadFarkleAdminDefaults(): Promise<FarkleAdminDefaults> {
  const { data, error } = await supabase.from('game_defaults')
    .select('*')
    .eq('game_type', 'farkle').single();
  const defaults = data as unknown as FarkleAdminDefaults | null;
  if (error || !defaults?.farkle_rules) throw new Error('Farkle defaults are unavailable.');
  return defaults;
}

/** Only dealer choices cross the RPC boundary; scoring always resolves on the server. */
export function farkleProductionSetup(stake: string, target: string, endgame: FarkleEndgame) {
  const ante = Number(stake), score = Number(target);
  if (!Number.isSafeInteger(ante) || ante < 1 || !Number.isSafeInteger(score) || score < 1
    || !['immediate', 'equal_turns', 'one_last_turn'].includes(endgame)) {
    throw new Error('Enter a positive whole-number stake and target score, and choose an endgame.');
  }
  return { ante_amount: ante, targetScore: score, endgame };
}
