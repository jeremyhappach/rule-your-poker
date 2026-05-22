/**
 * Cribbage Go/last-card race instrumentation.
 *
 * Persists fine-grained, NON-deduped trace events around the suspected
 * race path: Hap playPeggingCard write, bot callGo write, auto-Go effect,
 * and bot pegging effect. Each event carries a wall-clock timestamp and
 * a monotonic sequence number so we can reconstruct ordering across
 * client / bot / DB.
 *
 * Writes to `debug_sync_events` directly (bypassing the persistSyncDebugEvent
 * 1-second dedup window) because we explicitly want every step.
 *
 * Gated by:
 *   - URL ?cribbage_go_trace=1
 *   - localStorage ptp_cribbage_go_trace = "1"
 *   - debug channel ?ptp_debug=cribbage-go
 *
 * Fire-and-forget. Never blocks UI. Never throws.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CribbageState } from './cribbageTypes';

// ── Default-ON validation window ──────────────────────────────
//
// Per active bug hunt: Cribbage Go race tracing is ON by default for
// every session, with no URL / localStorage / console activation required.
//
// To disable when the bug is closed, flip ENABLED_DEFAULT to false (or
// delete this module and its call sites).
const ENABLED_DEFAULT = true;

export function isGoRaceTraceEnabled(): boolean {
  return ENABLED_DEFAULT;
}

let seq = 0;
function nextSeq(): number { return ++seq; }

export interface GoRaceCtx {
  gameId: string;
  roundId: string | null | undefined;
  handNumber: number;
  actorPlayerId?: string | null;
}

/** Compact pegging snapshot for trace payloads. */
export function peggingSnapshot(state: CribbageState | null | undefined) {
  if (!state) return null;
  const p = state.pegging;
  const scores: Record<string, number> = {};
  for (const [pid, ps] of Object.entries(state.playerStates ?? {})) {
    scores[pid.slice(0, 8)] = (ps as any).pegScore ?? 0;
  }
  return {
    phase: state.phase,
    currentCount: p?.currentCount,
    currentTurnPlayerId: p?.currentTurnPlayerId?.slice(0, 8) ?? null,
    goCalledBy: (p?.goCalledBy ?? []).map(id => id.slice(0, 8)),
    lastToPlay: p?.lastToPlay?.slice(0, 8) ?? null,
    playedCount: p?.playedCards?.length ?? 0,
    lastEventType: state.lastEvent?.type ?? null,
    lastEventPlayer: state.lastEvent?.playerId?.slice(0, 8) ?? null,
    lastEventPoints: (state.lastEvent as any)?.points ?? null,
    scores,
  };
}

export function traceGoRace(
  ctx: GoRaceCtx,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (!isGoRaceTraceEnabled()) return;
  const ts = Date.now();
  const s = nextSeq();
  // Make eventName unique-per-call to defeat any downstream dedup:
  // append monotonic seq. Original eventName preserved in payload.event.
  const uniqueName = `cribgo:${eventName}:${s}`;
  try {
    supabase
      .from('debug_sync_events' as any)
      .insert({
        game_id: ctx.gameId,
        game_type: 'cribbage',
        hand_number: ctx.handNumber,
        round_id: ctx.roundId ?? null,
        event_type: 'transition',
        severity: 'info',
        event_name: uniqueName,
        payload: {
          event: eventName,
          seq: s,
          ts,
          tsIso: new Date(ts).toISOString(),
          actor: ctx.actorPlayerId?.slice(0, 8) ?? null,
          ...payload,
        },
      } as any)
      .then(() => {}, () => {});
  } catch { /* never throw from trace */ }
}
