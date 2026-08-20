import { supabase } from '@/integrations/supabase/client';

export type AnteDecision = 'ante_up' | 'sit_out';

type AuthorityResult = {
  outcome?: string;
  decision?: AnteDecision;
  phase?: { outcome?: string };
  [key: string]: unknown;
};

export async function submitAnteDecision(params: {
  gameId: string;
  dealerGameId: string;
  playerId: string;
  decision: AnteDecision;
  autoAnte?: boolean;
  autoAnteRunback?: boolean;
}): Promise<AuthorityResult> {
  const { data, error } = await supabase.rpc('submit_ante_decision' as any, {
    p_game_id: params.gameId,
    p_expected_dealer_game_id: params.dealerGameId,
    p_player_id: params.playerId,
    p_decision: params.decision,
    p_auto_ante: params.autoAnte ?? null,
    p_auto_ante_runback: params.autoAnteRunback ?? null,
  } as any);
  if (error) throw error;
  return (data ?? {}) as AuthorityResult;
}

export async function advanceAntePhase(
  gameId: string,
  dealerGameId: string | null | undefined,
): Promise<AuthorityResult> {
  if (!gameId || !dealerGameId) return { outcome: 'stale_identity' };
  const { data, error } = await supabase.rpc('advance_ante_phase' as any, {
    p_game_id: gameId,
    p_expected_dealer_game_id: dealerGameId,
  } as any);
  if (error) throw error;
  return (data ?? {}) as AuthorityResult;
}

export async function advanceSessionDealerSelection(
  gameId: string,
): Promise<AuthorityResult> {
  const { data, error } = await supabase.rpc(
    'advance_session_dealer_selection' as any,
    { p_game_id: gameId } as any,
  );
  if (error) throw error;
  return (data ?? {}) as AuthorityResult;
}

export async function setGamePaused(
  gameId: string,
  paused: boolean,
): Promise<AuthorityResult> {
  const { data, error } = await supabase.rpc('set_game_paused' as any, {
    p_game_id: gameId,
    p_paused: paused,
  } as any);
  if (error) throw error;
  return (data ?? {}) as AuthorityResult;
}
