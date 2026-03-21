/**
 * Lightweight structured debug logger for multiplayer state-machine tracing.
 *
 * Writes to the `debug_events` table in Supabase.
 * Toggle on/off via:
 *   - URL param: ?debug_events=1
 *   - localStorage: ptp_debug_events = "1"
 *
 * All writes are fire-and-forget — never blocks gameplay.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Toggle ────────────────────────────────────────────────────

function isEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug_events');
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    if (window.localStorage.getItem('ptp_debug_events') === '1') return true;
  } catch { /* */ }
  return false;
}

let _enabled: boolean | null = null;
function enabled(): boolean {
  if (_enabled === null) _enabled = isEnabled();
  return _enabled;
}

/** Call after toggling localStorage at runtime */
export function refreshDebugEventFlag(): void {
  _enabled = isEnabled();
}

// ── Deduplication ─────────────────────────────────────────────

const recentKeys = new Set<string>();
const DEDUP_WINDOW_MS = 500;

function isDuplicate(key: string): boolean {
  if (recentKeys.has(key)) return true;
  recentKeys.add(key);
  setTimeout(() => recentKeys.delete(key), DEDUP_WINDOW_MS);
  return false;
}

// ── Core writer ───────────────────────────────────────────────

export interface DebugEventParams {
  gameId: string;
  roundId?: string | null;
  userId?: string | null;
  clientRole?: string;       // 'actor' | 'observer' | 'bot-controller'
  eventType: string;
  payload?: Record<string, unknown>;
}

export function logDebugEvent(params: DebugEventParams): void {
  if (!enabled()) return;

  // Lightweight dedup: same gameId + eventType + first payload key within 500ms
  const dedupKey = `${params.gameId}:${params.eventType}:${JSON.stringify(params.payload?.actionCount ?? '')}`;
  if (isDuplicate(dedupKey)) return;

  // Fire-and-forget — no await, no error surfacing
  supabase
    .from('debug_events' as any)
    .insert({
      game_id: params.gameId,
      round_id: params.roundId ?? null,
      user_id: params.userId ?? null,
      client_role: params.clientRole ?? null,
      event_type: params.eventType,
      payload: params.payload ?? {},
    } as any)
    .then(({ error }) => {
      if (error) console.warn('[debug_events] write failed:', error.message);
    });
}

// ── Gin Rummy helpers ─────────────────────────────────────────

/** Standard Gin state summary payload for every event */
export function ginStateSummary(state: {
  phase?: string;
  turnPhase?: string;
  actionCount?: number;
  currentTurnPlayerId?: string | null;
  playerStates?: Record<string, { hand?: unknown[] }>;
  discardPile?: unknown[];
  stockPile?: unknown[];
  winnerPlayerId?: string | null;
} | null, extra?: Record<string, unknown>): Record<string, unknown> {
  if (!state) return { state: null, ...extra };
  const hands: Record<string, number> = {};
  if (state.playerStates) {
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      hands[pid.slice(0, 8)] = ps.hand?.length ?? 0;
    }
  }
  return {
    phase: state.phase,
    turnPhase: state.turnPhase,
    actionCount: state.actionCount ?? 0,
    currentTurn: state.currentTurnPlayerId?.slice(0, 8) ?? null,
    hands,
    discardLen: state.discardPile?.length ?? 0,
    stockLen: state.stockPile?.length ?? 0,
    winner: state.winnerPlayerId?.slice(0, 8) ?? null,
    ...extra,
  };
}
