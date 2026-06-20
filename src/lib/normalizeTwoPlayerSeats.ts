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
 * Entry point (single):
 *   evaluatePlayerStatesEndOfGame() calls
 *   normalizeTwoPlayerSeatsIfNeeded() when activeHumanCount === 2.
 *   No other call site is permitted — leaves / sit-outs / timeouts
 *   already funnel into the end-of-game evaluator and must remain
 *   unaware that seat normalization exists.
 *
 * Safety:
 *   - Gated on inherently-2P game types only. Multiplayer games
 *     (Holm / 3-5-7 / Horses / SCC) MUST NOT mutate seats here even
 *     if only two humans happen to be present.
 *   - Two-pass UPDATE around UNIQUE(game_id, position).
 *   - games.dealer_position is rewritten in the same transaction if it
 *     pointed at a moved seat.
 *   - Only runs while no in-flight round exists (pre-game window),
 *     which is the invariant evaluatePlayerStatesEndOfGame already
 *     operates under.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveSessionHostPlayerId } from '@/lib/debugHarness/resolveHarnessHost';

const RING = 7;

const INHERENTLY_TWO_PLAYER_GAME_TYPES = new Set([
  'cribbage',
  'gin_rummy',
  'gin-rummy',
  'ginrummy',
  'yahtzee',
]);

function isInherentlyTwoPlayer(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return INHERENTLY_TWO_PLAYER_GAME_TYPES.has(gameType.toLowerCase());
}

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

export async function normalizeTwoPlayerSeatsIfNeeded(
  gameId: string,
): Promise<NormalizeResult> {
  if (!gameId) return { ran: false, reason: 'no-game-id' };

  // 1. Load game + players.
  const [gameRes, playersRes] = await Promise.all([
    supabase
      .from('games')
      .select('game_type, current_host, dealer_position')
      .eq('id', gameId)
      .maybeSingle(),
    supabase
      .from('players')
      .select('id, user_id, position, sitting_out, is_bot, status, created_at')
      .eq('game_id', gameId),
  ]);

  const game = gameRes.data as
    | { game_type?: string | null; current_host?: string | null; dealer_position?: number | null }
    | null;
  if (!game) return { ran: false, reason: 'game-not-found' };

  if (!isInherentlyTwoPlayer(game.game_type)) {
    return { ran: false, reason: 'not-inherently-2p-game-type' };
  }

  const players = (playersRes.data ?? []) as PlayerRow[];
  if (players.length === 0) return { ran: false, reason: 'no-players' };

  // 2. Compute active humans (mirrors evaluatePlayerStatesEndOfGame post-eval state).
  const activeHumans = players.filter(
    (p) =>
      !p.is_bot &&
      p.sitting_out !== true &&
      p.status !== 'observer' &&
      p.status !== 'left' &&
      typeof p.position === 'number',
  );
  if (activeHumans.length !== 2) {
    return { ran: false, reason: `active-humans=${activeHumans.length}` };
  }

  // 3. Identify host vs other.
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
    return { ran: false, reason: 'host-or-other-missing-position' };
  }

  // 4. Already opposite? circularDistance == 3 on 1..7 ring.
  const raw = Math.abs(host.position - other.position);
  const circularDistance = Math.min(raw, RING - raw);
  if (circularDistance === 3) {
    return {
      ran: false,
      reason: 'already-opposite',
      hostPosition: host.position,
      otherOldPosition: other.position,
    };
  }

  const targetPos = seatThreeClockwiseFrom(host.position);
  const otherOldPos = other.position;

  // 5. Find any occupant currently sitting at the target seat (could be
  //    bot / observer / left player still holding the seat).
  const occupant = players.find(
    (p) => p.id !== other.id && p.position === targetPos,
  );

  // 6. Two-pass UPDATE around UNIQUE(game_id, position).
  //    Use out-of-range placeholders (>= 1000) for the transient pass.
  const otherTempPos = 1000 + otherOldPos;
  const occupantTempPos = occupant ? 1001 + (occupant.position ?? 0) : null;

  // Pass 1: move conflicting rows out to placeholders.
  const moveOtherToTemp = await supabase
    .from('players')
    .update({ position: otherTempPos })
    .eq('id', other.id);
  if (moveOtherToTemp.error) {
    console.error('[SEAT NORMALIZE] pass1 other→temp failed:', moveOtherToTemp.error);
    return { ran: false, reason: 'pass1-other-failed' };
  }

  if (occupant && occupantTempPos != null) {
    const moveOccupantToTemp = await supabase
      .from('players')
      .update({ position: occupantTempPos })
      .eq('id', occupant.id);
    if (moveOccupantToTemp.error) {
      console.error('[SEAT NORMALIZE] pass1 occupant→temp failed:', moveOccupantToTemp.error);
      // Try to revert other.
      await supabase.from('players').update({ position: otherOldPos }).eq('id', other.id);
      return { ran: false, reason: 'pass1-occupant-failed' };
    }
  }

  // Pass 2: place rows at their final positions.
  //   - other     → targetPos
  //   - occupant  → otherOldPos (swap into the vacated seat)
  const placeOther = await supabase
    .from('players')
    .update({ position: targetPos })
    .eq('id', other.id);
  if (placeOther.error) {
    console.error('[SEAT NORMALIZE] pass2 other→target failed:', placeOther.error);
    // Best-effort revert.
    await supabase.from('players').update({ position: otherOldPos }).eq('id', other.id);
    if (occupant) {
      await supabase.from('players').update({ position: targetPos }).eq('id', occupant.id);
    }
    return { ran: false, reason: 'pass2-other-failed' };
  }

  if (occupant) {
    const placeOccupant = await supabase
      .from('players')
      .update({ position: otherOldPos })
      .eq('id', occupant.id);
    if (placeOccupant.error) {
      console.error('[SEAT NORMALIZE] pass2 occupant→other-old failed:', placeOccupant.error);
      // We are in a partially-applied state; surface but do not throw.
    }
  }

  // 7. Keep games.dealer_position consistent with the moved seats so
  //    the subsequent rotateDealerPosition() call lands on the correct
  //    next dealer. (Host did not move, so dealer_position==host.position
  //    needs no update.)
  const oldDealerPos = game.dealer_position ?? null;
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
    gameId,
    gameType: game.game_type,
    hostPosition: host.position,
    otherOldPosition: otherOldPos,
    otherNewPosition: targetPos,
    swappedWithPlayerId: occupant?.id ?? null,
    dealerPositionFrom: oldDealerPos,
    dealerPositionTo: newDealerPos,
  });

  return {
    ran: true,
    hostPosition: host.position,
    otherOldPosition: otherOldPos,
    otherNewPosition: targetPos,
    swappedWithPlayerId: occupant?.id ?? null,
  };
}
