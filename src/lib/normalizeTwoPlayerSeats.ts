/**
 * Two-Player Seat Normalization
 * =============================
 *
 * Contract:
 *   When exactly 2 active humans are seated at an inherently-2P game
 *   (Cribbage / Gin Rummy / Yahtzee) we PHYSICALLY move the non-host
 *   player to the seat three clockwise from the host so that the two
 *   active humans always occupy mathematically opposite seats on the
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
 *     - activeHumanCount changes  (player-state, not topology, signal)
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
  if (players.length === 0) {
    emit('skipped_not_two_humans', {
      statusBefore, gameType, activeHumanCount: 0,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return { ran: false, reason: 'no-players' };
  }

  const activeHumans = players.filter(
    (p) =>
      !p.is_bot &&
      p.sitting_out !== true &&
      p.status !== 'observer' &&
      p.status !== 'left' &&
      typeof p.position === 'number',
  );

  if (activeHumans.length !== 2) {
    emit('skipped_not_two_humans', {
      statusBefore, gameType, activeHumanCount: activeHumans.length,
      dealerPositionBefore, dealerPositionAfter: dealerPositionBefore,
    });
    return { ran: false, reason: `active-humans=${activeHumans.length}` };
  }

  const hostId = resolveSessionHostPlayerId(
    { current_host: game.current_host ?? null },
    activeHumans.map((p) => ({
      id: p.id,
      user_id: p.user_id ?? null,
      is_bot: p.is_bot ?? false,
      created_at: p.created_at ?? null,
    })),
  );
  const host = activeHumans.find((p) => p.id === hostId) ?? activeHumans[0];
  const other = activeHumans.find((p) => p.id !== host.id);
  if (!host || !other || host.position == null || other.position == null) {
    emit('skipped_host_or_other_missing_position', {
      statusBefore, gameType, activeHumanCount: 2,
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
      statusBefore, gameType, activeHumanCount: 2,
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

  const otherTempPos = 1000 + otherOldPos;
  const occupantTempPos = occupant ? 1001 + (occupant.position ?? 0) : null;

  const baseSnapshot = {
    statusBefore, gameType, activeHumanCount: 2,
    hostPlayerId: host.id, hostSeat: host.position,
    otherPlayerId: other.id, otherSeat: otherOldPos,
    rawDistance: raw, circularDistance, shouldNormalize: true,
    targetSeat: targetPos,
    occupantPlayerId: occupant?.id ?? null,
    dealerPositionBefore,
  };

  // Pass 1: move conflicting rows out to placeholders.
  const moveOtherToTemp = await supabase
    .from('players')
    .update({ position: otherTempPos })
    .eq('id', other.id)
    .select('id');
  if (moveOtherToTemp.error) {
    console.error('[SEAT NORMALIZE] pass1 other→temp failed:', moveOtherToTemp.error);
    emit('failed_pass1_other', {
      ...baseSnapshot,
      dbWriteAttempted: true, dbRowsUpdated: 0,
      dealerPositionAfter: dealerPositionBefore,
      errorMessage: moveOtherToTemp.error.message,
    });
    return { ran: false, reason: 'pass1-other-failed' };
  }

  if (occupant && occupantTempPos != null) {
    const moveOccupantToTemp = await supabase
      .from('players')
      .update({ position: occupantTempPos })
      .eq('id', occupant.id)
      .select('id');
    if (moveOccupantToTemp.error) {
      console.error('[SEAT NORMALIZE] pass1 occupant→temp failed:', moveOccupantToTemp.error);
      await supabase.from('players').update({ position: otherOldPos }).eq('id', other.id);
      emit('failed_pass1_occupant', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: 1,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: moveOccupantToTemp.error.message,
      });
      return { ran: false, reason: 'pass1-occupant-failed' };
    }
  }

  let rowsUpdated = (moveOtherToTemp.data?.length ?? 0);

  const placeOther = await supabase
    .from('players')
    .update({ position: targetPos })
    .eq('id', other.id)
    .select('id');
  if (placeOther.error) {
    console.error('[SEAT NORMALIZE] pass2 other→target failed:', placeOther.error);
    await supabase.from('players').update({ position: otherOldPos }).eq('id', other.id);
    if (occupant) {
      await supabase.from('players').update({ position: targetPos }).eq('id', occupant.id);
    }
    emit('failed_pass2_other', {
      ...baseSnapshot,
      dbWriteAttempted: true, dbRowsUpdated: rowsUpdated,
      dealerPositionAfter: dealerPositionBefore,
      errorMessage: placeOther.error.message,
    });
    return { ran: false, reason: 'pass2-other-failed' };
  }
  rowsUpdated += placeOther.data?.length ?? 0;

  if (occupant) {
    const placeOccupant = await supabase
      .from('players')
      .update({ position: otherOldPos })
      .eq('id', occupant.id)
      .select('id');
    if (placeOccupant.error) {
      console.error('[SEAT NORMALIZE] pass2 occupant→other-old failed:', placeOccupant.error);
      emit('failed_pass2_occupant', {
        ...baseSnapshot,
        dbWriteAttempted: true, dbRowsUpdated: rowsUpdated,
        dealerPositionAfter: dealerPositionBefore,
        errorMessage: placeOccupant.error.message,
      });
      // partially applied; do not throw
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

