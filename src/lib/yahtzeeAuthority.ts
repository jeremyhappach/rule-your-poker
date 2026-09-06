import { supabase } from '@/integrations/supabase/client';
import { executeDiceRpc } from './diceRequestRecovery';
import type { YahtzeeCategory, YahtzeeState } from './yahtzeeTypes';

export interface YahtzeeActionResult {
  outcome: 'applied' | 'stale_action' | 'rejected';
  reason?: string;
  action?: 'roll' | 'hold' | 'set_holds' | 'score';
  actionSequence: number;
  state: YahtzeeState;
  category?: YahtzeeCategory;
  score?: number;
  terminal?: boolean;
  settlement?: Record<string, unknown> | null;
}

function parseYahtzeeActionResult(data: any): YahtzeeActionResult {
  if (!data || !['applied', 'stale_action', 'rejected'].includes(data.outcome) || !data.state) {
    throw new Error('Yahtzee action RPC returned an invalid result');
  }
  return {
    outcome: data.outcome,
    reason: data.reason ?? undefined,
    action: data.action ?? undefined,
    actionSequence: Number(data.action_sequence ?? data.state.actionSequence ?? 0),
    state: data.state as YahtzeeState,
    category: data.category ?? undefined,
    score: data.score == null ? undefined : Number(data.score),
    terminal: data.terminal == null ? undefined : Boolean(data.terminal),
    settlement: data.settlement ?? null,
  };
}

export async function applyYahtzeeAction(args: {
  roundId: string;
  playerId: string;
  action: 'roll' | 'hold' | 'score' | 'bot_roll' | 'bot_score' | 'auto';
  dieIndex?: number | null;
  category?: YahtzeeCategory | null;
  holdMask?: boolean[] | null;
  expectedActionSequence?: number | null;
}): Promise<YahtzeeActionResult> {
  const data = await executeDiceRpc(supabase as any, 'yahtzee_apply_action', {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _action: args.action,
    _die_index: args.dieIndex ?? null,
    _category: args.category ?? null,
    _hold_mask: args.holdMask ? [...args.holdMask] : null,
    _expected_action_sequence: args.expectedActionSequence ?? null,
  }, args.expectedActionSequence != null);
  return parseYahtzeeActionResult(data);
}

export async function applyYahtzeeAutoRollAction(args: {
  roundId: string;
  playerId: string;
  action: 'bot_roll' | 'bot_score';
  category?: YahtzeeCategory | null;
  holdMask?: boolean[] | null;
  expectedActionSequence?: number | null;
}): Promise<YahtzeeActionResult> {
  const { data, error } = await (supabase as any).rpc('yahtzee_apply_auto_roll_action', {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _action: args.action,
    _category: args.category ?? null,
    _hold_mask: args.holdMask ? [...args.holdMask] : null,
    _expected_action_sequence: args.expectedActionSequence ?? null,
  });
  if (error) throw error;
  return parseYahtzeeActionResult(data);
}

export async function setYahtzeeHolds(args: {
  roundId: string;
  playerId: string;
  holdMask: boolean[];
  expectedActionSequence: number;
}): Promise<YahtzeeActionResult> {
  const data = await executeDiceRpc(supabase as any, 'yahtzee_set_holds', {
    _round_id: args.roundId,
    _player_id: args.playerId,
    _hold_mask: [...args.holdMask],
    _expected_action_sequence: args.expectedActionSequence,
  });
  return parseYahtzeeActionResult(data);
}

export async function advanceYahtzeePostgame(args: {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  handNumber: number;
}): Promise<{
  outcome: 'advanced' | 'already_advanced' | 'stale_identity';
  status: string;
  dealerPosition: number | null;
  configDeadline: string | null;
}> {
  const { data, error } = await (supabase as any).rpc('yahtzee_advance_postgame', {
    _game_id: args.gameId,
    _round_id: args.roundId,
    _dealer_game_id: args.dealerGameId,
    _hand_number: args.handNumber,
  });
  if (error) throw error;
  if (!data || !['advanced', 'already_advanced', 'stale_identity'].includes(data.outcome)) {
    throw new Error(`Unexpected Yahtzee postgame outcome: ${data?.outcome ?? 'missing'}`);
  }
  return {
    outcome: data.outcome,
    status: String(data.status ?? ''),
    dealerPosition: data.dealer_position == null ? null : Number(data.dealer_position),
    configDeadline: data.config_deadline == null ? null : String(data.config_deadline),
  };
}
