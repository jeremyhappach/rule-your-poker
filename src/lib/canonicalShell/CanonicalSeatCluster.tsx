/**
 * CanonicalSeatCluster — single atomic projected seat cluster.
 *
 * Shell-owned primitive that anchors a seat's identity row, dealer pip,
 * chip bubble, and an OPEN game-owned seat content region as ONE cohesive
 * unit at a canonical slot. Replaces fragmented floating elements that
 * could land partially on chrome, drift between active/observer
 * projections, or require contrast-ring band-aids.
 *
 * Ownership boundary (intentional, do not expand without review):
 *   Shell owns:
 *     - cluster anchoring / projection (CanonicalSlot)
 *     - identity row (name + dealer pip, inline)
 *     - chip bubble (carries data-chip-center for transport endpoints)
 *     - felt-toned backdrop so the cluster reads on light chrome
 *       without per-game contrast hacks
 *     - vertical cohesion between identity + chip + game-owned content
 *   Game owns (passed as children, fully arbitrary):
 *     - whatever projected seat content belongs to this game
 *       (Gin: hidden hand backs; Cribbage: dynamic hand region;
 *        Yahtzee: possibly none; future games: anything)
 *     - score rails / top HUD composition
 *     - what counts as "the dealer" (caller passes isDealer)
 *
 * NON-GOAL: the primitive does NOT encode game-shaped modes
 * (e.g. "static" / "dynamic" / "none"). The seat-content region is an
 * unopinionated children slot. If a game has no seat content, it passes
 * no children and the cluster collapses to identity + chip.
 *
 * Projection parity: identical for active-canonical and observer-absolute.
 * Placement is sourced ONLY from CanonicalSlot via canonicalSlotPlacement.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getCanonicalSlotPlacement } from './canonicalSlotPlacement';
import type { CanonicalSlot } from './seatAnchors';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import {
  getParticipantChipBgClass,
  getParticipantChipFgClass,
  type ParticipantStatus,
} from './participantStatus';

export interface CanonicalSeatClusterProps {
  /** Canonical slot this cluster anchors to. Null → not rendered. */
  slot: CanonicalSlot | null | undefined;
  /** Authoritative seat position (1..7) — written to data-chip-center
   *  so chip-transport animations resolve to the same DOM node. */
  position: number;
  /** Display name to show in the identity row. */
  name: string;
  /** Whether this seat currently holds the dealer pip. */
  isDealer?: boolean;
  /** Pre-formatted chip value (caller controls formatting / currency). */
  chipValue: string;
  /** Optional secondary line rendered below the chip bubble (e.g. running
   *  score for games that track per-player totals). Hidden when null. */
  scoreLine?: string | null;
  /**
   * Canonical participant status — drives the chip bubble fill color
   * via the shared `getParticipantChipBgClass` palette. Defaults to
   * `'active'` (white) so existing consumers that don't yet pass a
   * status keep their current rendering exactly.
   */
  status?: ParticipantStatus;
  /** Optional game-owned seat content rendered below the chip bubble as
   *  part of the same anchored cluster. Fully arbitrary per game — the
   *  shell does not assume card backs, hand layout, or any specific
   *  shape. Omit entirely (e.g. Yahtzee) and the cluster collapses to
   *  identity + chip with no reserved space. */
  children?: ReactNode;
  /** Optional override for the cluster wrapper. */
  className?: string;
}

export function CanonicalSeatCluster({
  slot,
  position,
  name,
  isDealer = false,
  chipValue,
  status = 'active',
  children,
  className,
}: CanonicalSeatClusterProps) {
  if (slot === null || slot === undefined) return null;

  // Canonical self-suppression: the local viewer is represented by the
  // active-player content area (and bottom HUD), NOT by a duplicate
  // chip cluster on the felt. Hoisted into the primitive so no
  // consumer needs to remember to suppress self per-render.
  const anchors = useSeatAnchorsOptional();
  if (anchors?.viewerPosition != null && anchors.viewerPosition === position) {
    return null;
  }


  const isObserverProjection =
    anchors?.projectionMode === 'observer-absolute' || anchors?.viewerPosition == null;
  const placement = getCanonicalSlotPlacement(
    slot,
    isObserverProjection ? 'occupied-observer' : 'occupied',
  );
  // Bottom-anchored slots (HOME bottom-center, bottom corners) must
  // render game-owned content ABOVE the identity+chip pill so the chip
  // bubble hugs the lower rail and card backs / hand region sit in
  // playable space above it. Top/middle slots keep the natural
  // identity → chip → content stack.
  const isBottomAnchored = slot === -1 || slot === -3 || slot === 0 || slot === 5;

  const chipBgClass = getParticipantChipBgClass(status);
  const chipFgClass = getParticipantChipFgClass(status);

  return (
    <div
      data-canonical-seat-cluster=""
      data-seat-position={position}
      data-seat-slot={slot}
      data-seat-status={status}
      className={cn(
        'absolute pointer-events-none flex gap-1',
        isBottomAnchored ? 'flex-col-reverse' : 'flex-col',
        placement.className,
        className,
      )}
    >
      {/* Felt-toned backdrop pill — wraps identity + chip only.
          Game-owned children sit OUTSIDE this pill so card geometry
          stays game-controlled. The pill keeps the cluster legible
          regardless of whether the slot lands on felt or chrome,
          replacing per-projection contrast hacks. */}
      <div
        className={cn(
          'flex flex-col items-center gap-0.5 rounded-full px-2 py-1',
          'bg-shell-neutral/55 ring-1 ring-black/30 shadow-[0_1px_3px_rgba(0,0,0,0.35)]',
          'backdrop-blur-[2px]',
        )}
      >
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/95 font-medium truncate max-w-[100px]">
            {name}
          </span>
          {isDealer && (
            <div className="w-3 h-3 rounded-full bg-red-600 border border-white flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[6px] leading-none">D</span>
            </div>
          )}
        </div>
        <div
          data-chip-center={position}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center border border-white/40',
            chipBgClass,
          )}
        >
          <span className={cn('text-[10px] font-bold', chipFgClass)}>
            {chipValue}
          </span>
        </div>
      </div>

      {children && (
        <div data-canonical-seat-cluster-content="" className="flex flex-col items-center">
          {children}
        </div>
      )}
    </div>
  );
}

