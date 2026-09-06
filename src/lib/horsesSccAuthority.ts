import { supabase } from '@/integrations/supabase/client';
import { executeDiceRpc } from './diceRequestRecovery';

export type HorsesSccCompletedRoundResult = {
  status: 'settled' | 'already_settled' | 'advanced' | 'already_advanced' | 'stale_identity';
  transition: 'terminal_settlement' | 'tie_rollover';
  terminalDisposition: 'game_over' | 'session_ended' | null;
  handNumber: number | null;
  roundNumber: number | null;
  anteAmount: number | null;
  activeCount: number | null;
  pot: number | null;
  preChips: Record<string, number> | null;
  postChips: Record<string, number> | null;
};

export type HorsesSccPostgameResult = {
  outcome: 'advanced' | 'already_advanced' | 'stale_identity';
  status: string;
  dealerPosition: number | null;
  configDeadline: string | null;
};

type ExactDiceIdentity = {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
};

function exactIdentityPayload(identity: ExactDiceIdentity) {
  return {
    p_game_id: identity.gameId,
    p_round_id: identity.roundId,
    p_dealer_game_id: identity.dealerGameId,
    p_hand_number: identity.handNumber,
  };
}

function numericRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, amount]) => [key, Number(amount)]),
  );
}

export async function advanceHorsesSccCompletedRound(
  identity: ExactDiceIdentity,
): Promise<HorsesSccCompletedRoundResult> {
  const data = await executeDiceRpc(supabase as any,
    'horses_scc_advance_completed_round',
    exactIdentityPayload(identity),
  );
  const allowedStatuses = [
    'settled',
    'already_settled',
    'advanced',
    'already_advanced',
    'stale_identity',
  ];
  const allowedTransitions = ['terminal_settlement', 'tie_rollover'];
  if (!data
      || !allowedStatuses.includes(data.status)
      || !allowedTransitions.includes(data.transition)) {
    throw new Error(
      `Unexpected Horses/SCC completed-round outcome: ${data?.status ?? 'missing'}/${data?.transition ?? 'missing'}`,
    );
  }

  return {
    status: data.status,
    transition: data.transition,
    terminalDisposition: ['game_over', 'session_ended'].includes(data.terminal_disposition)
      ? data.terminal_disposition
      : null,
    handNumber: data.hand_number == null ? null : Number(data.hand_number),
    roundNumber: data.round_number == null ? null : Number(data.round_number),
    anteAmount: data.ante_amount == null ? null : Number(data.ante_amount),
    activeCount: data.active_count == null ? null : Number(data.active_count),
    pot: data.pot == null ? null : Number(data.pot),
    preChips: numericRecord(data.pre_chips),
    postChips: numericRecord(data.post_chips),
  };
}

export async function advanceHorsesSccPostgame(
  identity: ExactDiceIdentity,
): Promise<HorsesSccPostgameResult> {
  const { data, error } = await (supabase as any).rpc(
    'horses_scc_advance_postgame',
    exactIdentityPayload(identity),
  );
  if (error) throw error;
  if (!data || !['advanced', 'already_advanced', 'stale_identity'].includes(data.outcome)) {
    throw new Error(`Unexpected Horses/SCC postgame outcome: ${data?.outcome ?? 'missing'}`);
  }
  return {
    outcome: data.outcome,
    status: String(data.status ?? ''),
    dealerPosition: data.dealer_position == null ? null : Number(data.dealer_position),
    configDeadline: data.config_deadline == null ? null : String(data.config_deadline),
  };
}
