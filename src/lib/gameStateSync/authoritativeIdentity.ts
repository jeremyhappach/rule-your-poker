/**
 * Authoritative Identity — Canonical identity continuity feed.
 *
 * Solves the stale-identity blind window class of bugs:
 *
 *   A client subscribes / polls only the *currently known round*. When another
 *   client advances authoritative state to a new round, the local listener
 *   (scoped to the OLD round_id) cannot observe the new round. Presentation
 *   stays internally consistent but globally stale until a parent watcher
 *   eventually hydrates a new roundId prop.
 *
 * The fix is structural: identity-bearing realtime subscriptions MUST be
 * scoped by `dealer_game_id` (or `game_id` for single-round games) so that
 * `rounds` INSERT / UPDATE events across boundaries are always observed.
 *
 * This module owns the single source of "what identity is authoritative
 * right now" and exposes it as a stable, comparable object that the sync
 * framework can react to without each game inventing its own boundary
 * detection logic.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';

export {
  authoritativeIdentityEquals,
  isIdentityForward,
  identityKey,
} from './authoritativeIdentityPure';
export type { AuthoritativeIdentity } from './authoritativeIdentityPure';

import {
  authoritativeIdentityEquals,
  isIdentityForward,
  identityKey,
  type AuthoritativeIdentity,
} from './authoritativeIdentityPure';

// ─────────────────────────────────────────────────────────────────────────────
// useAuthoritativeIdentity — long-lived subscription scoped by dealer_game_id
// ─────────────────────────────────────────────────────────────────────────────

interface UseAuthoritativeIdentityOptions {
  /** Dealer-game (session) id. The subscription is scoped to this. */
  dealerGameId: string | null | undefined;
  /**
   * Optional selector that picks the active round row from the rounds list.
   * Different games have different rules. Defaults to "max hand_number, then
   * max round_number".
   */
  pickActiveRound?: (rounds: RoundRow[]) => RoundRow | null;
  /** Disable the hook (returns null identity). */
  enabled?: boolean;
}

export interface RoundRow {
  id: string;
  dealer_game_id: string | null;
  hand_number: number | null;
  round_number: number | null;
}

interface UseAuthoritativeIdentityResult {
  identity: AuthoritativeIdentity | null;
  rounds: RoundRow[];
  loading: boolean;
}

function defaultPickActiveRound(rounds: RoundRow[]): RoundRow | null {
  if (!rounds.length) return null;
  return rounds.reduce<RoundRow | null>((best, r) => {
    if (!best) return r;
    const bh = best.hand_number ?? -1;
    const rh = r.hand_number ?? -1;
    if (rh > bh) return r;
    if (rh < bh) return best;
    const brn = best.round_number ?? -1;
    const rrn = r.round_number ?? -1;
    return rrn > brn ? r : best;
  }, null);
}

/**
 * Subscribes to the rounds table filtered by dealer_game_id. The subscription
 * spans round boundaries by construction, so identity advancement is observed
 * synchronously regardless of which round_id the UI is currently bound to.
 *
 * This is the framework-level identity feed. Game tables MUST consume this
 * (or an equivalent dealer-scoped feed) instead of subscribing to a single
 * round_id, to eliminate the structural blind window described at top of file.
 */
export function useAuthoritativeIdentity(
  opts: UseAuthoritativeIdentityOptions,
): UseAuthoritativeIdentityResult {
  const {
    dealerGameId,
    pickActiveRound = defaultPickActiveRound,
    enabled = true,
  } = opts;

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!enabled || !dealerGameId) {
      setRounds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void supabase
      .from('rounds')
      .select('id, dealer_game_id, hand_number, round_number')
      .eq('dealer_game_id', dealerGameId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setRounds(data as RoundRow[]);
        setLoading(false);
      });

    const channel = supabase
      .channel(`auth-identity-${dealerGameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `dealer_game_id=eq.${dealerGameId}`,
        },
        (payload) => {
          if (cancelled) return;
          setRounds((prev) => {
            const next = [...prev];
            const newRow = payload.new as RoundRow | null;
            const oldRow = payload.old as RoundRow | null;
            if (payload.eventType === 'DELETE' && oldRow?.id) {
              return next.filter((r) => r.id !== oldRow.id);
            }
            if (newRow?.id) {
              const idx = next.findIndex((r) => r.id === newRow.id);
              if (idx >= 0) next[idx] = newRow;
              else next.push(newRow);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [dealerGameId, enabled]);

  const activeRound = pickActiveRound(rounds);
  const identity: AuthoritativeIdentity | null = activeRound
    ? {
        dealerGameId: activeRound.dealer_game_id ?? dealerGameId ?? null,
        handNumber: activeRound.hand_number ?? null,
        roundId: activeRound.id,
      }
    : null;

  return { identity, rounds, loading };
}
