import { supabase } from '@/integrations/supabase/client';

export type ThreeFiveSevenSetupDeclineResult = {
  outcome: 'declined' | 'already_declined';
  deduped: boolean;
  status: 'game_selection' | 'dealer_selection' | 'waiting' | 'session_ended';
  dealer_position: number | null;
  config_deadline: string | null;
};

export async function declineThreeFiveSevenSetup(params: {
  gameId: string;
  expectedDealerPosition: number;
  expectedConfigDeadline: string | null | undefined;
}): Promise<ThreeFiveSevenSetupDeclineResult> {
  if (!params.expectedConfigDeadline) {
    throw new Error('3-5-7 setup decline is missing its committed configuration deadline.');
  }

  const { data, error } = await supabase.rpc(
    'three_five_seven_decline_setup' as any,
    {
      p_game_id: params.gameId,
      p_expected_dealer_position: params.expectedDealerPosition,
      p_expected_config_deadline: params.expectedConfigDeadline,
    } as any,
  );

  if (error) {
    throw error;
  }

  const result = data as unknown as ThreeFiveSevenSetupDeclineResult | null;
  if (!result || !['declined', 'already_declined'].includes(result.outcome)) {
    throw new Error(`3-5-7 setup decline returned an invalid result: ${JSON.stringify(data)}`);
  }

  return result;
}
