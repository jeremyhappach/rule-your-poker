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
 *   - configured per-game decision timer + seed-as-pct-of-configured (no hardcoded sec thresholds)
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

// Track last-seen deadline per (gameId, roundId) so we only log on identity change
const lastSeenDeadline = new Map<string, string>();

/** Returns true if this is a new deadline identity (i.e. real turn transition). */
export function shouldLogTurnTransition(gameId: string, roundId: string | null, deadlineIso: string): boolean {
  const key = `${gameId}:${roundId ?? '_'}`;
  const prev = lastSeenDeadline.get(key);
  if (prev === deadlineIso) return false;
  lastSeenDeadline.set(key, deadlineIso);
  return true;
}

/** True when no prior deadline has ever been recorded for this (game, round). */
export function isFreshMountForRound(gameId: string, roundId: string | null): boolean {
  const key = `${gameId}:${roundId ?? '_'}`;
  return !lastSeenDeadline.has(key);
}

export function logTurnTransitionSeed(params: SeedLogParams): void {
  if (!params.userId) return;

  // Relative-to-configured analysis (no hardcoded second thresholds).
  const cfg = params.configuredTimerSec && params.configuredTimerSec > 0 ? params.configuredTimerSec : null;
  const seedPct = cfg ? params.seedValue / cfg : null;
  const rawPct = cfg ? params.rawRemainingSec / cfg : null;
  const isLowSeed = seedPct !== null && seedPct < SUSPICIOUS_SEED_PCT;

  const payload = {
    turn_owner_id: params.turnOwnerId,
    server_deadline_iso: params.serverDeadlineIso,
    server_deadline_ms: new Date(params.serverDeadlineIso).getTime(),
    client_receive_ts: params.clientReceiveTs,
    client_to_server_skew_ms: params.clientReceiveTs - new Date(params.serverDeadlineIso).getTime(),
    raw_remaining_sec: params.rawRemainingSec,
    seed_value_sec: params.seedValue,
    is_fresh_mount: params.isFreshMount,
    network_sim_mode: getNetworkSimMode(),
    hand_number: params.handNumber,
    configured_timer_sec: cfg,
    seed_pct_of_configured: seedPct,
    raw_pct_of_configured: rawPct,
    is_low_seed: isLowSeed,
  };

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
