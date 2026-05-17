/**
 * Canonical Seat Anchor contract (Phase 1).
 *
 * Single source of truth for resolving authoritative seat positions
 * (1..7) into canonical visual slot anchors used by the persistent
 * table shell.
 *
 * Pure module — no React, no DOM. Consumers (SeatAnchorLayer provider,
 * bodies, overlays, chip transport) read anchors through this module
 * so geometry stays consistent across phone/tablet and across every
 * game body.
 *
 * Projection modes (locked by product contract):
 *   - 'observer-absolute' — observers see literal absolute seating.
 *   - 'active-canonical'  — seated players see themselves at HOME and
 *                            other seats rotated relative to them.
 *
 * 2-player face-to-face canonicalization (product requirement):
 * This is GAME-TYPE driven, NOT player-count driven. Only games that
 * are *inherently* 2-player (Cribbage, Gin Rummy, Yahtzee) canonicalize
 * the opponent to the FACE_TO_FACE slot. Multiplayer-capable games
 * (Holm, 3-5-7, Horses, SCC) ALWAYS preserve relative seating semantics
 * even when only two humans happen to be seated — additional players
 * may join and the seating model must remain semantically consistent.
 * Observer mode never canonicalizes.
 *
 * Hidden seats never reflow others: an unoccupied or hidden position
 * simply yields a null anchor — the perimeter geometry is fixed.
 */

import {
  recordShellEvent,
  checkProjectionMode,
} from './diagnostics';

// ── Types ─────────────────────────────────────────────────────

export type ProjectionMode = 'observer-absolute' | 'active-canonical';

/**
 * Canonical visual slot identifiers.
 *
 *   HOME (-1)         — bottom-center; the viewing seated player
 *   FACE_TO_FACE (-2) — top-center; only valid in inherently-2P
 *                       active-canonical games
 *   0..5              — perimeter, clockwise starting from bottom-left:
 *                       0 bottom-left   1 middle-left   2 top-left
 *                       3 top-right     4 middle-right  5 bottom-right
 */
export const SLOT = {
  HOME: -1,
  FACE_TO_FACE: -2,
} as const;

export type CanonicalSlot = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Inherently 2-player game types. Canonicalization is driven by game
 * design, not by current seat occupancy. Keep this list narrow.
 */
const INHERENTLY_TWO_PLAYER_GAME_TYPES: ReadonlySet<string> = new Set([
  'cribbage',
  'gin_rummy',
  'ginrummy',
  'gin-rummy',
  'yahtzee',
]);

export function isInherentlyTwoPlayerGameType(gameType: string | null | undefined): boolean {
  if (!gameType) return false;
  return INHERENTLY_TWO_PLAYER_GAME_TYPES.has(gameType.toLowerCase());
}

export interface SeatAnchorInput {
  /** Authoritative seat position (1..7). */
  position: number;
  /** Whether the seat is currently occupied by an active participant. */
  occupied: boolean;
  /** Hidden seats are excluded from the anchor map (return null). */
  hidden?: boolean;
}

export interface SeatAnchorResolutionContext {
  projectionMode: ProjectionMode;
  /** Position of the viewing player, or null for observers. */
  viewerPosition: number | null;
  /** All seats considered by the shell for this render. */
  seats: SeatAnchorInput[];
  /** Optional diagnostic identifiers. */
  gameId?: string;
  /**
   * Game type — REQUIRED to opt into 2P face-to-face canonicalization.
   * Only inherently-2P game types (see INHERENTLY_TWO_PLAYER_GAME_TYPES)
   * canonicalize; multiplayer-capable games always use relative seating
   * regardless of current player count.
   */
  gameType?: string;
}

export interface ResolvedSeatAnchor {
  position: number;
  slot: CanonicalSlot | null;
  /** True if this anchor was relocated by 2P face-to-face canonicalization. */
  canonicalized2p: boolean;
}

// ── Pure resolution helpers ───────────────────────────────────

const OBSERVER_POS_TO_SLOT: Record<number, CanonicalSlot> = {
  1: 2,
  2: 1,
  3: 0,
  4: -1,
  5: 5,
  6: 4,
  7: 3,
};

export function observerSlotForPosition(position: number): CanonicalSlot | null {
  const s = OBSERVER_POS_TO_SLOT[position];
  return s ?? null;
}

export function clockwiseDistance(viewerPosition: number, otherPosition: number): number {
  const ring = 7;
  return ((otherPosition - viewerPosition) + ring) % ring;
}

/**
 * Active-canonical mapping for a seated viewer.
 *
 * Established convention (matches existing MobileGameTable rendering):
 *   distance 1 → slot 0 (bottom-left)
 *   distance 2 → slot 1 (middle-left)
 *   distance 3 → slot 2 (top-left)
 *   distance 4 → slot 3 (top-right)
 *   distance 5 → slot 4 (middle-right)
 *   distance 6 → slot 5 (bottom-right)
 *
 * Note: "clockwise distance" here is a positional label
 * (playerPos - viewerPos mod 7), not a literal visual direction.
 */
const ACTIVE_DISTANCE_TO_SLOT: Record<number, CanonicalSlot> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
};

export function activeSlotForDistance(distance: number): CanonicalSlot | null {
  if (distance === 0) return SLOT.HOME;
  return ACTIVE_DISTANCE_TO_SLOT[distance] ?? null;
}

// ── Resolver ──────────────────────────────────────────────────

export function resolveSeatAnchors(
  ctx: SeatAnchorResolutionContext,
): ResolvedSeatAnchor[] {
  checkProjectionMode(ctx.projectionMode, ctx.gameId);

  const { projectionMode, viewerPosition, seats, gameType } = ctx;

  // 2P face-to-face is gated on GAME TYPE, not player count.
  // Multiplayer-capable games preserve relative seating even when only
  // two humans are currently seated.
  const isTwoPlayerGameType = isInherentlyTwoPlayerGameType(gameType);
  const activeOccupied = seats.filter(s => s.occupied && !s.hidden);
  const canCanonicalize2p =
    projectionMode === 'active-canonical' &&
    isTwoPlayerGameType &&
    viewerPosition !== null &&
    activeOccupied.length === 2 &&
    activeOccupied.some(s => s.position === viewerPosition);

  return seats.map((seat) => {
    if (seat.hidden) {
      return { position: seat.position, slot: null, canonicalized2p: false };
    }

    if (projectionMode === 'observer-absolute' || viewerPosition === null) {
      return {
        position: seat.position,
        slot: observerSlotForPosition(seat.position),
        canonicalized2p: false,
      };
    }

    // active-canonical
    if (canCanonicalize2p && seat.position !== viewerPosition && seat.occupied) {
      if (import.meta.env.DEV) {
        recordShellEvent('seat-anchor-canonicalized-2p', {
          gameId: ctx.gameId ?? null,
          gameType: ctx.gameType ?? null,
          detail: {
            viewerPosition,
            opponentPosition: seat.position,
            reason: 'inherently-2p-game-type',
          },
        });
      }
      return {
        position: seat.position,
        slot: SLOT.FACE_TO_FACE,
        canonicalized2p: true,
      };
    }

    const distance = clockwiseDistance(viewerPosition, seat.position);
    return {
      position: seat.position,
      slot: activeSlotForDistance(distance),
      canonicalized2p: false,
    };
  });
}

export function resolveSingleAnchor(
  position: number,
  ctx: Omit<SeatAnchorResolutionContext, 'seats'> & { seats?: SeatAnchorInput[] },
): CanonicalSlot | null {
  const seats: SeatAnchorInput[] = ctx.seats ?? [{ position, occupied: true }];
  const all = resolveSeatAnchors({ ...ctx, seats });
  return all.find(a => a.position === position)?.slot ?? null;
}
