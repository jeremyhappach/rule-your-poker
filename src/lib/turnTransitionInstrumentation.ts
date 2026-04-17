/**
 * Targeted turn-transition timer instrumentation.
 *
 * Logs ONE event per (gameId, roundId, decisionDeadline) identity change,
 * capturing what the client sees the moment a new decision deadline arrives:
 *   - server deadline timestamp
 *   - client receive timestamp
 *   - computed remaining seconds (raw, pre-floor)
 *   - seed value handed to setTimeLeft (post-floor)
 *   - whether this represents a fresh mount (no prior deadline tracked)
 *   - active network sim mode
 *
 * Writes to public.debug_events with event_type='turn-transition-timer-seed'.
 * Fire-and-forget — never blocks gameplay. Always-on (lightweight, one row
 * per turn change), but auto-suppressed if user_id is unavailable.
 */
import { supabase } from '@/integrations/supabase/client';
import { getNetworkSimMode } from '@/lib/networkSim';

interface SeedLogParams {
  gameId: string;
  roundId: string | null;
  handNumber: number | null;
  userId: string | null;
  turnOwnerId: string | null;       // current_turn player.id (or null if none)
  serverDeadlineIso: string;        // raw decision_deadline string
  clientReceiveTs: number;          // Date.now() when this effect ran
  rawRemainingSec: number;          // calculateRemaining() result (pre-floor)
  seedValue: number;                // value actually passed to setTimeLeft
  isFreshMount: boolean;            // first time we see this deadline identity
  configuredTimerSec: number | null; // game_defaults.decision_timer_seconds for this game
}

// Threshold (relative to configured timer) below which a fresh seed is suspicious.
// 0.5 = seeded with less than half the configured duration on a brand-new turn.
const SUSPICIOUS_SEED_PCT = 0.5;


  supabase
    .from('debug_events' as any)
    .insert({
      game_id: params.gameId,
      round_id: params.roundId,
      user_id: params.userId,
      client_role: 'turn-timer',
      event_type: 'turn-transition-timer-seed',
      payload,
    } as any)
    .then(({ error }) => {
      if (error) console.warn('[turn-timer-instr] insert failed:', error.message);
    });
}
