/**
 * Canonical Seat Anchor contract.
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
 * TOMBSTONE — FACE_TO_FACE retired:
 *   Inherently-2P games (Cribbage, Gin, Yahtzee) used to project the
 *   opponent to a bespoke FACE_TO_FACE slot (-2) and observers got a
 *   mirrored ergonomic layout. That entire concept was retired once
 *   `normalizeTwoPlayerSeatsIfNeeded()` started moving the second
 *   human into the physically-opposite seat at the next-dealer-game
 *   boundary (waiting → dealer_selection). With normalized topology
 *   the ordinary clockwise-distance / absolute-perimeter projection
 *   produces the correct face-to-face geometry for FREE.
 *
 *   Contract: ONE TABLE / ONE SEAT / ONE POSITION / ZERO FACE_TO_FACE
 *   CODE PATHS. Do NOT reintroduce a 2P branch here — fix the seat
 *   topology at the mutation boundary instead.
 *
 * Hidden seats never reflow others: an unoccupied or hidden position
 * simply yields a null anchor — the perimeter geometry is fixed.
 */

import { checkProjectionMode } from './diagnostics';

// ── Types ─────────────────────────────────────────────────────

export type ProjectionMode = 'observer-absolute' | 'active-canonical';

/**
 * Canonical visual slot identifiers.
 *
 *   HOME (-1)         — bottom-center; the viewing seated player
 *   BOTTOM_RAIL (-3)  — observer-only anchor for absolute "south"
 *                       (position 4). Sits flush against the bottom
 *                       rail OUTSIDE the active play zone so it never
 *                       obscures gameplay-critical central content
 *                       (pegging count, action lane, dice tray).
 *                       Never used in active-canonical projection.
 *   0..5              — perimeter, clockwise starting from bottom-left:
 *                       0 bottom-left   1 middle-left   2 top-left
 *                       3 top-right     4 middle-right  5 bottom-right
 *
 * Slot -2 (FACE_TO_FACE) is permanently retired — see file header.
 */
export const SLOT = {
  HOME: -1,
  BOTTOM_RAIL: -3,
} as const;

export type CanonicalSlot = -3 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

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
   * Game type — retained for diagnostics only. No projection branch
   * keys off this value; FACE_TO_FACE-style 2P canonicalization is
   * permanently retired (see file header tombstone).
   */
  gameType?: string;
}

export interface ResolvedSeatAnchor {
  position: number;
  slot: CanonicalSlot | null;
}

// ── Pure resolution helpers ───────────────────────────────────

const OBSERVER_POS_TO_SLOT: Record<number, CanonicalSlot> = {
  1: 2,
  2: 1,
  3: 0,
  // Observer pos 4 anchors at BOTTOM_RAIL (a small, rail-hugging anchor
  // below the felt ellipse). It MUST NOT reuse HOME — HOME sits inside
  // the active gameplay lane (pegging count, action zone, dice tray)
  // and observers should never obscure that content.
  4: -3,
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
 * Handedness contract: positions advance clockwise around the table
 * (viewed from above) — the observer-absolute map proves it (pos 4 at
 * bottom-center, pos 5 to its visual right). When the viewer becomes
 * HOME and faces center, the next clockwise seat (distance 1) is to
 * their RIGHT, not their left.
 *
 *   distance 1 → slot 5 (bottom-right)
 *   distance 2 → slot 4 (middle-right)
 *   distance 3 → slot 3 (top-right)
 *   distance 4 → slot 2 (top-left)
 *   distance 5 → slot 1 (middle-left)
 *   distance 6 → slot 0 (bottom-left)
 */
const ACTIVE_DISTANCE_TO_SLOT: Record<number, CanonicalSlot> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
  6: 0,
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

  const { projectionMode, viewerPosition, seats } = ctx;

  return seats.map((seat) => {
    if (seat.hidden) {
      return { position: seat.position, slot: null };
    }

    if (projectionMode === 'observer-absolute' || viewerPosition === null) {
      return {
        position: seat.position,
        slot: observerSlotForPosition(seat.position),
      };
    }

    const distance = clockwiseDistance(viewerPosition, seat.position);
    return {
      position: seat.position,
      slot: activeSlotForDistance(distance),
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
