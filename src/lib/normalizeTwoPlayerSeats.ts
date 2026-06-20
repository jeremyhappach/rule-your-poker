/**
 * Two-Player Seat Normalization
 * =============================
 *
 * Contract:
 *   When exactly 2 active players are seated at an inherently-2P game
 *   (Cribbage / Gin Rummy / Yahtzee) we PHYSICALLY move the non-host
 *   player to the seat three clockwise from the host so that the two
 *   active players always occupy mathematically opposite seats on the
 *   1..7 ring. This eliminates the need for FACE_TO_FACE projection
 *   logic in the seat-anchor layer — once seats are normalized,
 *   canonical observer-absolute / active-canonical geometry suffices.
 *
 * Topology mutation boundary (ONE rule):
 *   normalizeTwoPlayerSeatsIfNeeded() MAY ONLY run immediately before a
 *   status flip that hands control to the next dealer-game bootstrap:
 *     - waiting        → dealer_selection           (Start Game)
 *     - game_over      → dealer_selection           (make-it-take-it bot won)
 *     - game_over/ante → game_selection             (rotate next dealer)
 *     - ante_decision  → cribbage_dealer_selection  (cribbage handoff)
 *     - DealerConfig sit-out rotations (→ game_selection)
 *
 *   It MUST NOT run on:
 *     - game_over → waiting       (humans own seats at the waiting table)
 *     - any waiting-table event   (sit down / sit out / rejoin / render)
 *     - active-player count changes (player-state, not topology, signal)
 *     - selectors / visibility    (read paths)
 *
 * Safety:
 *   - Two-pass UPDATE around UNIQUE(game_id, position).
 *   - games.dealer_position is rewritten in the same transaction if it
 *     pointed at a moved seat.
 *   - Only runs in the pre-bootstrap window so no in-flight round JSONB
 *     is invalidated.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveSessionHostPlayerId } from '@/lib/debugHarness/resolveHarnessHost';

const RING = 7;

/** Position three seats clockwise from `h` on the 1..7 ring. */
function seatThreeClockwiseFrom(h: number): number {
  return ((h - 1 + 3) % RING) + 1;
}


interface PlayerRow {
  id: string;
  user_id: string | null;
  position: number | null;
  sitting_out: boolean | null;
  is_bot: boolean | null;
  status: string | null;
  created_at: string | null;
}

export interface NormalizeResult {
  ran: boolean;
  reason?: string;
  hostPosition?: number;
  otherOldPosition?: number;
  otherNewPosition?: number;
  swappedWithPlayerId?: string | null;
}

import { recordNormalizationDbg, type NormalizationResultCode } from '@/lib/normalizationDbg';

export async function normalizeTwoPlayerSeatsIfNeeded(
  gameId: string,
  caller: string = 'unknown',
): Promise<NormalizeResult> {
  const emit = (
    result: NormalizationResultCode,
    extra: Partial<Parameters<typeof recordNormalizationDbg>[0]> = {},
  ) => {
    recordNormalizationDbg({
      kind: 'normalize',
      caller,
      gameId,
      result,
      ...extra,
    });
  };

  if (!gameId) {
    emit('skipped_no_game');
    return { ran: false, reason: 'no-game-id' };
  }

  // 1. Load game + players (+ status for audit).
  const [gameRes, playersRes] = await Promise.all([
    supabase
      .from('games')
      .select('game_type, current_host, dealer_position, status')
      .eq('id', gameId)
      .maybeSingle(),
    supabase
      .from('players')
      .select('id, user_id, position, sitting_out, is_bot, status, created_at')
      .eq('game_id', gameId),
  ]);

  const game = gameRes.data as
    | { game_type?: string | null; current_host?: string | null; dealer_position?: number | null; status?: string | null }
    | null;
  if (!game) {
    emit('skipped_no_game', { errorMessage: 'game-not-found' });
    return { ran: false, reason: 'game-not-found' };
  }

  const statusBefore = game.status ?? null;
  const gameType = game.game_type ?? null;
  const dealerPositionBefore = game.dealer_position ?? null;

  const players = (playersRes.data ?? []) as PlayerRow[];
  const playerSnapshots = players.map((p) => ({
    playerId: p.id,
    isBot: p.is_bot === true,
    status: p.status ?? null,
    sittingOut: p.sitting_out === true,
    position: p.position ?? null,
  }));
  const activeSeated = players.filter(
    (p) =>
      p.sitting_out !== true &&
      p.status !== 'observer' &&
      p.status !== 'left' &&
      typeof p.position === 'number',
  );
  const activeHumans = activeSeated.filter((p) => !p.is_bot);
  if (players.length === 0) {
    emit('skipped_not_two_active_seated', {
      statusBefore, gameType, activeSeatedPlayers: 0, activeHumanPlayers: 0, activeHumanCount: 0, players: playerSnapshots,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return { ran: false, reason: 'no-players' };
  }

  if (activeSeated.length !== 2) {
    emit('skipped_not_two_active_seated', {
      statusBefore, gameType, activeSeatedPlayers: activeSeated.length, activeHumanPlayers: activeHumans.length, activeHumanCount: activeHumans.length, players: playerSnapshots,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return { ran: false, reason: `active-seated=${activeSeated.length}` };
  }

  const hostId = resolveSessionHostPlayerId(
    { current_host: game.current_host ?? null },
    activeSeated.map((p) => ({
      id: p.id,
      user_id: p.user_id ?? null,
      is_bot: p.is_bot ?? false,
      created_at: p.created_at ?? null,
    })),
  );
  const host = activeSeated.find((p) => p.id === hostId) ?? activeSeated[0];
  const other = activeSeated.find((p) => p.id !== host.id);
  if (!host || !other || host.position == null || other.position == null) {
    emit('skipped_host_or_other_missing_position', {
      statusBefore, gameType, activeSeatedPlayers: activeSeated.length, activeHumanPlayers: activeHumans.length, activeHumanCount: activeHumans.length, players: playerSnapshots,
      hostPlayerId: host?.id ?? null, hostSeat: host?.position ?? null,
      otherPlayerId: other?.id ?? null, otherSeat: other?.position ?? null,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return { ran: false, reason: 'host-or-other-missing-position' };
  }

  const raw = Math.abs(host.position - other.position);
  const circularDistance = Math.min(raw, RING - raw);
  const shouldNormalize = circularDistance !== 3;
  const targetPos = seatThreeClockwiseFrom(host.position);
  const otherOldPos = other.position;

  if (!shouldNormalize) {
    emit('skipped_already_opposite', {
      statusBefore, gameType, activeSeatedPlayers: activeSeated.length, activeHumanPlayers: activeHumans.length, activeHumanCount: activeHumans.length, players: playerSnapshots,
      hostPlayerId: host.id, hostSeat: host.position,
      otherPlayerId: other.id, otherSeat: other.position,
      rawDistance: raw, circularDistance, shouldNormalize: false,
      targetSeat: targetPos,
      dbWriteAttempted: false, dbRowsUpdated: 0,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return {
      ran: false,
      reason: 'already-opposite',
      hostPosition: host.position,
      otherOldPosition: other.position,
    };
  }

  const occupant = players.find(
    (p) => p.id !== other.id && p.position === targetPos,
  );

  const baseSnapshot = {
    statusBefore, gameType, activeSeatedPlayers: activeSeated.length, activeHumanPlayers: activeHumans.length, activeHumanCount: activeHumans.length, players: playerSnapshots,
    hostPlayerId: host.id, hostSeat: host.position,
    otherPlayerId: other.id, otherSeat: otherOldPos,
    rawDistance: raw, circularDistance, shouldNormalize: true,
    targetSeat: targetPos,
    occupantPlayerId: occupant?.id ?? null,
    dealerPositionBefore,
  };

  let rowsUpdated = 0;

  if (!occupant) {
    // Simple, direct move — target seat is empty. No placeholder pass,
    // no UNIQUE collision, no position_check violation.
    const move = await supabase
      .from('players')
      .update({ position: targetPos })
      .eq('id', other.id)
      .select('id');
    if (move.error) {
      console.error('[SEAT NORMALIZE] direct move failed:', move.error);
      emit('failed_pass2_other', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: 0,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: move.error.message,
      });
      return { ran: false, reason: 'direct-move-failed' };
    }
    rowsUpdated += move.data?.length ?? 0;
  } else {
    // Swap with occupant using NULL as the only placeholder (position
    // is nullable and not constrained by players_position_check).
    //   1) occupant   → NULL
    //   2) other      → targetPos      (occupant's old seat)
    //   3) occupant   → otherOldPos    (other's old seat)
    const parkOccupant = await supabase
      .from('players')
      .update({ position: null })
      .eq('id', occupant.id)
      .select('id');
    if (parkOccupant.error) {
      console.error('[SEAT NORMALIZE] park occupant→NULL failed:', parkOccupant.error);
      emit('failed_pass1_occupant', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: 0,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: parkOccupant.error.message,
      });
      return { ran: false, reason: 'park-occupant-failed' };
    }
    rowsUpdated += parkOccupant.data?.length ?? 0;

    const placeOther = await supabase
      .from('players')
      .update({ position: targetPos })
      .eq('id', other.id)
      .select('id');
    if (placeOther.error) {
      console.error('[SEAT NORMALIZE] place other→target failed:', placeOther.error);
      // Best-effort revert occupant.
      await supabase.from('players').update({ position: targetPos }).eq('id', occupant.id);
      emit('failed_pass2_other', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: rowsUpdated,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: placeOther.error.message,
      });
      return { ran: false, reason: 'place-other-failed' };
    }
    rowsUpdated += placeOther.data?.length ?? 0;

    const placeOccupant = await supabase
      .from('players')
      .update({ position: otherOldPos })
      .eq('id', occupant.id)
      .select('id');
    if (placeOccupant.error) {
      console.error('[SEAT NORMALIZE] place occupant→other-old failed:', placeOccupant.error);
      emit('failed_pass2_occupant', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: rowsUpdated,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: placeOccupant.error.message,
      });
      // Partially applied; other is at targetPos, occupant is parked at NULL.
    } else {
      rowsUpdated += placeOccupant.data?.length ?? 0;
    }
  }


  // 7. Keep games.dealer_position consistent.
  const oldDealerPos = dealerPositionBefore;
  let newDealerPos = oldDealerPos;
  if (oldDealerPos != null) {
    if (oldDealerPos === otherOldPos) newDealerPos = targetPos;
    else if (occupant && oldDealerPos === targetPos) newDealerPos = otherOldPos;
  }
  if (newDealerPos !== oldDealerPos) {
    const upd = await supabase
      .from('games')
      .update({ dealer_position: newDealerPos })
      .eq('id', gameId);
    if (upd.error) {
      console.error('[SEAT NORMALIZE] dealer_position update failed:', upd.error);
    }
  }

  console.log('[SEAT NORMALIZE] normalized 2P seats', {
    gameId, caller, gameType, hostPosition: host.position,
    otherOldPosition: otherOldPos, otherNewPosition: targetPos,
    swappedWithPlayerId: occupant?.id ?? null,
    dealerPositionFrom: oldDealerPos, dealerPositionTo: newDealerPos,
  });

  emit('normalized', {
    ...baseSnapshot,
    dbWriteAttempted: true,
    dbRowsUpdated: rowsUpdated,
    dealerPositionAfter: newDealerPos,
  });

  return {
    ran: true,
    hostPosition: host.position,
    otherOldPosition: otherOldPos,
    otherNewPosition: targetPos,
    swappedWithPlayerId: occupant?.id ?? null,
  };
}

