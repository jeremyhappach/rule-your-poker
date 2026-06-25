/**
 * useOpponentShowdownHold — Game Default harness for the 3-5-7
 * opponent exposed showdown. Snapshot-backed presentation hold.
 *
 * Contract (per approved design):
 *   - Real game, real flow. No fixtures, no RPC, no server writes,
 *     no timer/deal/rule changes.
 *   - When the harness is selected (`enabled=true`) and the live
 *     3-5-7 surface admits the opponent exposed showdown, the caller
 *     invokes `arm(snapshot)` ONCE with a self-contained payload.
 *   - Once armed, `holdActive` stays true and `snapshot` is preserved
 *     verbatim even as authoritative state (handContextId, round,
 *     cards) advances underneath. The held surface is sourced from
 *     the snapshot, NOT recomputed from live state.
 *   - `release()` clears the snapshot in one shot (CONTINUE HAND).
 *   - Auto-release fires ONLY when `enabled` flips false (harness
 *     toggled off) or the host unmounts. Authoritative-state changes
 *     do NOT auto-release — that would defeat the harness.
 *
 * Geometry Lab values (sizing/fan/overlap/attachment/offsets) are
 * intentionally NOT part of the snapshot — they remain live so the
 * Lab can be tuned against the held surface.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card as CardType } from '@/lib/cardUtils';

/**
 * Per-opponent-seat snapshot. Captures every render input the live
 * PlayerHand showdown branch consumes (cards + branch flags + side
 * identity) AND the surrounding seat-pill presentation (name, chip
 * text, dealer, position). Card objects are preserved by reference
 * at capture time and must not be recomputed from live round data.
 */
export interface OpponentShowdownSeatSnapshot {
  playerId: string;
  position: number;
  /** Display name (bot alias resolved at capture). */
  displayName: string;
  /** Formatted chip text (e.g. "$123"), frozen at capture. */
  chipText: string;
  isDealer: boolean;
  isRightSide: boolean;
  isBottomPosition: boolean;
  /** Full normalized card payloads (rank/suit/id/etc.). */
  cards: CardType[];
  /** Player's decision at capture ('stay' | 'fold' | null). */
  playerDecision: 'stay' | 'fold' | null;
  /** Round that admitted the showdown (1/2/3). Drives PlayerHand layout. */
  currentRound: number;
  /** Original count for layout (cards.length but preserved explicitly). */
  displayCardCount: number;
  /** Existing PlayerHand showdown branch flags — preserved verbatim. */
  showSeparated: boolean;
  unusedCardsBelow: boolean;
  /** Which 357 showdown branch admitted this row. */
  showdownBranch: 'winningLeg' | 'round3Multi' | 'secretReveal';
}

export interface OpponentShowdownHoldSnapshot {
  /** Stable id for the hold session (Date.now-based). */
  id: string;
  /** Identity fields at capture (diagnostic only — not used for auto-release). */
  capturedGameId: string | null;
  capturedDealerGameId: string | null;
  capturedHandContextId: string | null;
  capturedRound: number;
  /** Per-opponent seat snapshots, keyed by player.id. */
  seatsByPlayerId: Record<string, OpponentShowdownSeatSnapshot>;
}

export interface UseOpponentShowdownHoldArgs {
  /** True when the harness is selected AND game is 3-5-7. */
  enabled: boolean;
}

export interface UseOpponentShowdownHoldArgsExtended extends UseOpponentShowdownHoldArgs {
  /** Current authoritative gameId; change vs captured ⇒ auto-release. */
  gameId: string | null;
  /** Current authoritative dealerGameId; change vs captured ⇒ auto-release. */
  dealerGameId: string | null;
  /** True iff current gameType is in the 3-5-7 family; false ⇒ auto-release. */
  isThreeFiveSevenFamily: boolean;
}

export interface UseOpponentShowdownHoldReturn {
  holdActive: boolean;
  snapshot: OpponentShowdownHoldSnapshot | null;
  /** Arm the hold with a complete snapshot. No-op if already armed or disabled. */
  arm: (snapshot: Omit<OpponentShowdownHoldSnapshot, 'id'>) => void;
  /** Release the hold immediately (CONTINUE HAND). */
  release: () => void;
}

export function useOpponentShowdownHold(
  args: UseOpponentShowdownHoldArgsExtended,
): UseOpponentShowdownHoldReturn {
  const { enabled, gameId, dealerGameId, isThreeFiveSevenFamily } = args;
  const [snapshot, setSnapshot] = useState<OpponentShowdownHoldSnapshot | null>(null);
  const snapshotRef = useRef<OpponentShowdownHoldSnapshot | null>(null);
  snapshotRef.current = snapshot;
  // Latched identity at arm time. Used ONLY for hard-boundary auto-release
  // (gameId / dealerGameId / family). Round / hand / awaitingNextRound
  // changes intentionally do NOT release — that is the whole point of the hold.
  const latchedGameIdRef = useRef<string | null>(null);
  const latchedDealerGameIdRef = useRef<string | null>(null);

  const arm = useCallback(
    (incoming: Omit<OpponentShowdownHoldSnapshot, 'id'>) => {
      if (!enabled) return;
      if (!isThreeFiveSevenFamily) return;
      if (snapshotRef.current) return; // already armed — single-shot
      const id = `357-osh-${Date.now()}`;
      const next: OpponentShowdownHoldSnapshot = { id, ...incoming };
      snapshotRef.current = next;
      latchedGameIdRef.current = incoming.capturedGameId ?? gameId ?? null;
      latchedDealerGameIdRef.current = incoming.capturedDealerGameId ?? dealerGameId ?? null;
      setSnapshot(next);
      // eslint-disable-next-line no-console
      console.log('[357 OPPONENT SHOWDOWN HOLD] armed', {
        id,
        seats: Object.keys(next.seatsByPlayerId).length,
        round: next.capturedRound,
        gameId: latchedGameIdRef.current,
        dealerGameId: latchedDealerGameIdRef.current,
      });
    },
    [enabled, isThreeFiveSevenFamily, gameId, dealerGameId],
  );

  const release = useCallback(() => {
    if (!snapshotRef.current) return;
    // eslint-disable-next-line no-console
    console.log('[357 OPPONENT SHOWDOWN HOLD] released', { id: snapshotRef.current.id });
    snapshotRef.current = null;
    latchedGameIdRef.current = null;
    latchedDealerGameIdRef.current = null;
    setSnapshot(null);
  }, []);

  // Auto-release on hard boundaries only:
  //   - harness disabled
  //   - 3-5-7 family exited
  //   - gameId changed vs latched (session teardown / new game)
  //   - dealerGameId changed vs latched (Run It Back creates a new dealer_game)
  // Round / hand / awaitingNextRound changes are intentionally ignored.
  useEffect(() => {
    if (!snapshotRef.current) return;
    if (!enabled) { release(); return; }
    if (!isThreeFiveSevenFamily) { release(); return; }
    if (latchedGameIdRef.current && gameId && gameId !== latchedGameIdRef.current) {
      release(); return;
    }
    if (latchedDealerGameIdRef.current && dealerGameId && dealerGameId !== latchedDealerGameIdRef.current) {
      release(); return;
    }
  }, [enabled, isThreeFiveSevenFamily, gameId, dealerGameId, release]);

  useEffect(() => {
    return () => {
      snapshotRef.current = null;
      latchedGameIdRef.current = null;
      latchedDealerGameIdRef.current = null;
    };
  }, []);

  return {
    holdActive: snapshot !== null,
    snapshot,
    arm,
    release,
  };
}

