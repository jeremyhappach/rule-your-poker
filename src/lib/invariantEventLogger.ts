/**
 * Canonical production invariant writer.
 *
 * Normal traces and state transitions are debug-gated elsewhere. Only an
 * impossible-state invariant should reach this module. Violations are written
 * to `debug_events`, edge-deduplicated by exact game/round/hand identity, and
 * never awaited by gameplay.
 */

import { supabase } from '@/integrations/supabase/client';
import { getClientId } from '@/lib/clientContext';

const recentInvariantKeys = new Map<string, number>();
const INVARIANT_DEDUP_MS = 30_000;
const MAX_RECENT_KEYS = 500;

export interface InvariantEvent {
  gameId: string;
  gameType: string;
  handNumber: number;
  roundId?: string | null;
  invariantName: string;
  severity?: 'warn' | 'error';
  context?: Record<string, unknown>;
  onResult?: (ok: boolean, reason?: string) => void;
}

function admitInvariant(key: string): boolean {
  const now = Date.now();
  const previous = recentInvariantKeys.get(key);
  if (previous !== undefined && now - previous < INVARIANT_DEDUP_MS) return false;

  recentInvariantKeys.set(key, now);
  if (recentInvariantKeys.size > MAX_RECENT_KEYS) {
    for (const [candidate, timestamp] of recentInvariantKeys) {
      if (now - timestamp >= INVARIANT_DEDUP_MS) recentInvariantKeys.delete(candidate);
    }
  }
  return true;
}

export function persistInvariantEvent(event: InvariantEvent): void {
  if (!event.gameId) {
    event.onResult?.(false, 'missing-game-id');
    return;
  }

  const key = [
    event.gameId,
    event.roundId ?? 'no-round',
    event.handNumber,
    event.gameType,
    event.invariantName,
  ].join(':');
  if (!admitInvariant(key)) {
    event.onResult?.(false, 'duplicate');
    return;
  }

  void supabase
    .from('debug_events' as never)
    .insert({
      game_id: event.gameId,
      round_id: event.roundId ?? null,
      client_role: 'invariant-monitor',
      event_type: event.invariantName,
      payload: {
        diagnosticKind: 'invariant',
        gameType: event.gameType,
        handNumber: event.handNumber,
        severity: event.severity ?? 'error',
        clientId: getClientId(),
        ...(event.context ?? {}),
      },
    } as never)
    .then(({ error }: { error: { message?: string } | null }) => {
      if (error) {
        console.warn('[invariant-event] write failed:', error.message);
        event.onResult?.(false, error.message);
        return;
      }
      event.onResult?.(true);
    });
}

/** Test-only reset for deterministic dedup assertions. */
export function resetInvariantEventDedup(): void {
  recentInvariantKeys.clear();
}
