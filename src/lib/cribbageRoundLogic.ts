// Cribbage round orchestration - database integration layer

import { supabase } from '@/integrations/supabase/client';
import type { CribbageState } from './cribbageTypes';

/**
 * Start a new Cribbage round/hand.
 * 
 * This creates a round record with cribbage_state initialized:
 * - Shuffles and deals cards to each player
 * - Sets up the discard phase
 * - Initializes peg scores and pot
 */
export async function startCribbageRound(
  gameId: string,
  _isFirstHand: boolean = true
): Promise<{ success: boolean; roundId?: string; handNumber?: number; error?: string }> {
  try {
    const { data, error } = await (supabase as any).rpc('start_cribbage_initial_hand', {
      _game_id: gameId,
    });
    if (error) throw error;
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.outcome === 'rejected') {
      return { success: false, error: String(result.reason ?? 'Cribbage hand start rejected') };
    }
    return {
      success: result.outcome === 'started' || result.outcome === 'already-started',
      roundId: typeof result.round_id === 'string' ? result.round_id : undefined,
      handNumber: typeof result.hand_number === 'number' ? result.hand_number : 1,
    };
  } catch (error: any) {
    console.error('[CRIBBAGE] Error starting round:', error);
    return { success: false, error: error.message };
  }
}
/**
 * Start a new cribbage hand after counting phase completes.
 *
 * Server-authoritative: successor-round creation runs inside the
 * `cribbage_complete_counting` RPC, which independently derives scoring,
 * observes the presentation lease, and creates the successor atomically.
 */
export async function startNextCribbageHand(
  _gameId: string,
  _dealerGameId: string,
  _previousState: CribbageState,
  _playerIds: string[],
  predecessorRoundId: string | null
): Promise<{ success: boolean; roundId?: string; handNumber?: number; newState?: CribbageState; error?: string; alreadyStarted?: boolean }> {
  try {
    if (!predecessorRoundId) {
      throw new Error('startNextCribbageHand requires predecessorRoundId (server dedupe key)');
    }
    const { data, error } = await (supabase as any).rpc('cribbage_complete_counting', {
      _round_id: predecessorRoundId,
    });
    if (error) throw error;
    const result = (data ?? {}) as {
      outcome?: string;
      round_id?: string;
      hand_number?: number;
      state?: CribbageState;
      deduped?: boolean;
    };
    if (result.outcome === 'terminal') {
      return { success: true, newState: result.state };
    }
    if (result.outcome === 'presentation_pending') {
      return { success: false, error: 'Counting presentation is still active' };
    }
    if (!result.round_id) throw new Error(`Unexpected counting outcome: ${result.outcome ?? 'missing'}`);
    return {
      success: true,
      roundId: result.round_id,
      handNumber: result.hand_number,
      alreadyStarted: result.outcome === 'already_active' || result.deduped === true,
    };
  } catch (error: any) {
    console.error('[CRIBBAGE] Error starting next hand:', error);
    return { success: false, error: error.message };
  }
}
