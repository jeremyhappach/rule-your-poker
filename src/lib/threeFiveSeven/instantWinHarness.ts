/**
 * 3-5-7 Instant Dealer Win Harness (admin-only).
 *
 * Persists a one-shot override for a game's NEXT Round 1 deal. The
 * winning `startRound` client reads the pending override, replaces the
 * target player's dealt cards with the forced 3-5-7 hand, and atomically
 * marks the row consumed so it can never be re-used.
 *
 * The forced hand still routes through the normal authoritative
 * `player_cards` insert and the normal `has357Hand` detection path —
 * we do NOT synthesize the winner or bypass the rule under test.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Card } from "@/lib/cardUtils";

// Deterministic forced hand: 3♣, 5♦, 7♥ — matches the platform's
// documented instant-win screenshot.
export const FORCED_357_CARDS: Card[] = [
  { rank: '3', suit: '♣' },
  { rank: '5', suit: '♦' },
  { rank: '7', suit: '♥' },
];

export interface ForceDealRow {
  id: string;
  game_id: string;
  target_player_id: string;
  target_cards: Card[];
  created_by: string;
  created_at: string;
  consumed_at: string | null;
  consumed_dealer_game_id: string | null;
  consumed_round_id: string | null;
  consumed_hand_number: number | null;
}

/** Fetch pending override for a game (null if none). Admin RLS required. */
export async function fetchPending357ForceDeal(gameId: string): Promise<ForceDealRow | null> {
  const { data, error } = await (supabase as any)
    .from('three_five_seven_force_deal')
    .select('*')
    .eq('game_id', gameId)
    .is('consumed_at', null)
    .maybeSingle();
  if (error) {
    // Non-admins hit RLS and get null data — treat any error as "no override".
    return null;
  }
  return (data as ForceDealRow) ?? null;
}

/**
 * Atomically mark override consumed. Uses `consumed_at IS NULL` guard so
 * only the first client to consume it wins.
 * Returns true iff this caller flipped the row.
 */
export async function consume357ForceDeal(
  id: string,
  ctx: { dealerGameId: string | null; roundId: string; handNumber: number },
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('three_five_seven_force_deal')
    .update({
      consumed_at: new Date().toISOString(),
      consumed_dealer_game_id: ctx.dealerGameId,
      consumed_round_id: ctx.roundId,
      consumed_hand_number: ctx.handNumber,
    })
    .eq('id', id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

/** Admin write path: queue a forced deal for a game/player. */
export async function queue357ForceDeal(params: {
  gameId: string;
  targetPlayerId: string;
  createdBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Clear any prior pending row for this game (idempotent).
  await (supabase as any)
    .from('three_five_seven_force_deal')
    .delete()
    .eq('game_id', params.gameId)
    .is('consumed_at', null);
  const { error } = await (supabase as any)
    .from('three_five_seven_force_deal')
    .insert({
      game_id: params.gameId,
      target_player_id: params.targetPlayerId,
      target_cards: FORCED_357_CARDS as any,
      created_by: params.createdBy,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Admin: cancel any pending override for a game. */
export async function cancel357ForceDeal(gameId: string): Promise<void> {
  await (supabase as any)
    .from('three_five_seven_force_deal')
    .delete()
    .eq('game_id', gameId)
    .is('consumed_at', null);
}
