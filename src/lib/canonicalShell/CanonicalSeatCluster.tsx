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
 *     - inner/outer/overlay decorator side-resolution (mid-/top-/
 *       bottom-right slots flip inner↔outer automatically so games
 *       never have to know the geometry)
 *     - ergonomic raise (Holm-stayed multi-player showdown) via
 *       `raisePosition` driving `getCanonicalSlotRaiseClass`
 *   Game owns (passed as children / decoration slots, fully arbitrary):
 *     - whatever projected seat content belongs to this game
 *       (Gin: hidden hand backs; Cribbage: dynamic hand region;
 *        Yahtzee: possibly none; Holm/3-5-7: card backs + exposed
 *        cards; Horses/SCC: none)
 *     - leg pips, auto-roll indicator, dealer pip glyph, turn-pulse
 *       ring, emoticon overlays — passed via innerDecoration /
 *       outerDecoration / chipOverlay
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

import { cloneElement, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { CanonicalChipDisc } from '@/components/canonicalShell/CanonicalChipDisc';
import { cn } from '@/lib/utils';
import {
  getCanonicalSlotPlacement,
  getCanonicalSlotRaiseClass,
  isRightSideCanonicalSlot,
} from './canonicalSlotPlacement';
import type { CanonicalSlot } from './seatAnchors';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import {
  getParticipantChipBgClass,
  getParticipantChipFgClass,
  getParticipantChipRingClass,
  type ParticipantStatus,
  type CanonicalSeatStatusRing,
} from './participantStatus';
import {
  noteChipContinuityMount,
  recordChipRuntimeContinuity,
} from '@/lib/wartimeDebug/surfaces';
import { recordWartime } from '@/lib/wartimeDebug/core';
import { notePresessionGeometryEvent } from '@/lib/wartimeDebug/presessionGeometrySampler';

let _csc_seq = 0;

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
  /**
   * Decorator rendered toward the table center (inner side of chip).
   * The cluster resolves which physical side is "inner" from the slot
   * (left-side slots → right of chip, right-side slots → left of
   * chip). Use for leg pips, auto-roll indicators, etc.
   */
  innerDecoration?: ReactNode;
  /**
   * Decorator rendered away from the table center (outer side of
   * chip). Use for the dealer pip glyph and similar outward chrome.
   */
  outerDecoration?: ReactNode;
  /**
   * Absolutely-positioned overlay rendered over the chip bubble itself
   * (e.g. turn-pulse ring, emoticon). Sits at `inset-0` of the chip
   * face, above the value/icon text.
   */
  chipOverlay?: ReactNode;
  /**
   * Optional click handler attached to the chip bubble (e.g. host
   * tap-to-manage). When provided, the chip face gains
   * `cursor-pointer` and an `active:scale-95` press affordance.
   */
  onChipClick?: () => void;
  /** Dim the chip face (e.g. folded). */
  dimChip?: boolean;
  /**
   * Ergonomic raise — when true, shifts the cluster vertically toward
   * the table center via `getCanonicalSlotRaiseClass(slot)`. Used for
   * Holm multi-player showdown when this seat stayed so exposed cards
   * do not overlap community cards. The decision to raise is
   * game-owned; the placement is shell-owned.
   */
  raisePosition?: boolean;
  /**
   * Suppress the shell's identity pill entirely. Use for rare cases
   * like Holm multi-player showdown where the chip is hidden to make
   * room for exposed cards. When true, only `children` are rendered at
   * the slot anchor.
   */
  hideChipBubble?: boolean;
  /** Optional override for the cluster wrapper. */
  className?: string;
  /**
   * CHIP_RENDER_OWNER attribution — identifies which renderer mounted
   * this visible chip cluster. Required by Wartime to detect duplicate
   * shell vs gameplay chip ownership during the pre-game overlap window
   * (waiting → interstitial → dealer-selection → ante-decision).
   *
   * Pass a stable string that names the calling component / branch,
   * e.g. 'Shell:PreSessionSeatLayer',
   * 'Gameplay:CribbageMobileGameTable.projectedSeatOverlay',
   * 'Slot:MobileGameTable.preSessionPill'.
   */
  ownerLabel?: string;
  /** Player id whose chip this cluster represents (for renderer
   *  ownership attribution). */
  playerId?: string | null;
  /** Opt-in override: render the viewer's own HOME cluster instead of
   *  applying canonical self-suppression. Used by pre-session surfaces
   *  (waiting/interstitial) where identity must be visible on the felt
   *  because there is no active-player content to anchor it. */
  allowSelfRender?: boolean;
  /**
   * Wave 3C.1 — CanonicalOpponentSeat avatar slot.
   *
   * Optional arbitrary node rendered inside the felt pill ABOVE the
   * identity row (name + dealer pip). Intended for a per-player
   * avatar / team logo / profile glyph. Sized by the caller (the
   * cluster does not impose a fixed avatar geometry — different
   * surfaces may want different sizes). Omit for the legacy
   * identity-row-only rendering — zero visual change.
   */
  avatar?: ReactNode;
  /**
   * Wave 3C.1 — CanonicalOpponentSeat status-ring slot.
   *
   * Opt-in colored ring around the chip disc. Independent of the
   * chip FILL color (which is owned by `status`) so games can
   * express transient turn highlighting ('turn') without disturbing
   * the participant-status palette. Resolves via
   * `getParticipantChipRingClass`. 'active' / null / undefined →
   * no ring (default — passive consumers can pass-through their
   * existing `status` and only non-active seats gain a ring).
   */
  statusRing?: CanonicalSeatStatusRing;
  /**
   * Wave 3C.3a — chip HUD wrapper slot.
   *
   * Optional React element that WRAPS the chip-disc node. Used to
   * mount a countdown ring (ActivePlayerHUD) or a future shell-owned
   * chip HUD around the chip body without the cluster knowing about
   * the HUD's internals. The cluster clones the element and injects
   * the chip-disc node as its `children`. Omit → chip is rendered
   * inline (current behavior, zero visual change).
   */
  chipHUD?: ReactElement;
  /**
   * Wave 3C.3a — children rendered INSIDE the chip disc.
   *
   * Intended for value-change flash siblings (+$, +L) and future
   * shell-owned chip effects that must paint over the disc face.
   * Sits alongside the value text and the `chipOverlay` slot. Omit
   * → nothing extra is rendered (current behavior, zero visual
   * change).
   */
  chipDiscChildren?: ReactNode;
  /**
   * Wave 3C.3a — chip presentation mode.
   *
   *  - 'auto'   : render the canonical chip disc as today (default).
   *  - 'hidden' : suppress the chip disc entirely (identity row +
   *               decorations still render; outer cluster geometry
   *               preserved). Used for Holm showdown / emoticon
   *               fallback cases that want to hide the chip but keep
   *               the seat anchored.
   *  - ReactNode: render the provided node IN PLACE of the chip disc
   *               (e.g. a dice-result badge that replaces the chip
   *               for Horses/SCC completed players).
   *
   * Default 'auto' keeps every existing consumer pixel-identical.
   */
  chipPresentation?: 'auto' | 'hidden' | ReactNode;
  /**
   * Wave 3C.3a — name row placement within the identity pill.
   *
   *  - 'above-chip' : render the name+dealer row above the chip
   *                   (default — current behavior).
   *  - 'below-chip' : render the name+dealer row below the chip
   *                   (below the score line if present).
   *  - 'none'       : suppress the name+dealer row entirely. Use
   *                   when the consumer is rendering its own name
   *                   element outside the cluster.
   *
   * Default 'above-chip' preserves every existing consumer's layout.
   */
  namePlacement?: 'above-chip' | 'below-chip' | 'none';
}

export function CanonicalSeatCluster({
  slot,
  position,
  name,
  isDealer = false,
  chipValue,
  status = 'active',
  scoreLine,
  children,
  innerDecoration,
  outerDecoration,
  chipOverlay,
  onChipClick,
  dimChip = false,
  raisePosition = false,
  hideChipBubble = false,
  className,
  ownerLabel,
  playerId = null,
  allowSelfRender = false,
  avatar,
  statusRing,
  chipHUD,
  chipDiscChildren,
  chipPresentation = 'auto',
  namePlacement = 'above-chip',
}: CanonicalSeatClusterProps) {
  // CHIP_RUNTIME_CONTINUITY hooks — must run unconditionally so the
  // mount/unmount events fire regardless of slot/self-suppression
  // outcomes. The conditional returns below early-out the render but
  // leave hook order stable.
  const anchors = useSeatAnchorsOptional();
  const clusterInstanceIdRef = useRef<string>('');
  if (!clusterInstanceIdRef.current) {
    clusterInstanceIdRef.current = `csc-p${position}-${++_csc_seq}`;
  }
  const rootRef = useRef<HTMLDivElement | null>(null);
  const providerInstanceId = anchors?.providerInstanceId ?? null;
  const surfaceLabel =
    anchors?.projectionMode === 'observer-absolute'
      ? 'observer-absolute'
      : (anchors?.viewerPosition != null ? 'active-canonical' : 'unscoped');
  useEffect(() => {
    if (slot === null || slot === undefined) return;
    if (anchors?.viewerPosition != null && anchors.viewerPosition === position) return;
    const rootEl = rootRef.current;
    const chipEl = typeof document !== 'undefined'
      ? (document.querySelector(`[data-chip-center="${position}"]`) as HTMLElement | null)
      : null;
    const rect = rootEl?.getBoundingClientRect();
    const payload = {
      phase: 'mount' as const,
      surface: surfaceLabel,
      position,
      playerId: null,
      providerInstanceId,
      clusterInstanceId: clusterInstanceIdRef.current,
      rootDomNodeId: rootEl ? `dom-csc-${clusterInstanceIdRef.current}` : null,
      chipDomNodeId: chipEl ? `dom-chip-${clusterInstanceIdRef.current}` : null,
      rootRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    };
    recordChipRuntimeContinuity(payload);
    noteChipContinuityMount(payload);

    // CHIP_RENDER_OWNER — emitted ONCE per visible chip cluster mount.
    // Pairs with the unmount below. Two CHIP_RENDER_OWNER events with
    // the same (playerId, position) and visible=true and no unmount
    // between them = duplicate renderer (Wartime defect).
    recordWartime('OWNERSHIP', 'CHIP_RENDER_OWNER', {
      playerId,
      position,
      renderer: 'CanonicalSeatCluster',
      owner: ownerLabel ?? '(unspecified)',
      component: ownerLabel ?? '(unspecified)',
      surface: surfaceLabel,
      visible: true,
      providerInstanceId,
      clusterInstanceId: clusterInstanceIdRef.current,
      chipDomNodeId: chipEl ? `dom-chip-${clusterInstanceIdRef.current}` : null,
      phase: 'mount',
    });
    notePresessionGeometryEvent();
    return () => {
      recordChipRuntimeContinuity({
        phase: 'unmount',
        surface: surfaceLabel,
        position,
        playerId: null,
        providerInstanceId,
        clusterInstanceId: clusterInstanceIdRef.current,
        rootDomNodeId: null,
        chipDomNodeId: null,
        rootRect: null,
      });
      recordWartime('OWNERSHIP', 'CHIP_RENDER_OWNER', {
        playerId,
        position,
        renderer: 'CanonicalSeatCluster',
        owner: ownerLabel ?? '(unspecified)',
        component: ownerLabel ?? '(unspecified)',
        surface: surfaceLabel,
        visible: false,
        providerInstanceId,
        clusterInstanceId: clusterInstanceIdRef.current,
        chipDomNodeId: null,
        phase: 'unmount',
      });
      notePresessionGeometryEvent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (slot === null || slot === undefined) return null;

  // Canonical self-suppression: the local viewer is represented by the
  // active-player content area (and bottom HUD), NOT by a duplicate
  // chip cluster on the felt. Hoisted into the primitive so no
  // consumer needs to remember to suppress self per-render.
  if (!allowSelfRender && anchors?.viewerPosition != null && anchors.viewerPosition === position) {
    return null;
  }


  const isObserverProjection =
    anchors?.projectionMode === 'observer-absolute' || anchors?.viewerPosition == null;
  // 2P face-to-face canonicalization (Cribbage / Gin / Yahtzee): the
  // opponent slot 2/3 gets pushed to the outer perimeter rail so the
  // chip cluster clears the top-band branding and score bars. Multi-
  // player observer projections keep the default in-felt anchor.
  const canonicalized2p = anchors?.byPosition.get(position)?.canonicalized2p ?? false;
  const placement = getCanonicalSlotPlacement(
    slot,
    canonicalized2p && (slot === 2 || slot === 3)
      ? 'occupied-2p-face'
      : isObserverProjection
        ? 'occupied-observer'
        : 'occupied',
  );
  const raiseClass = raisePosition ? getCanonicalSlotRaiseClass(slot) : '';
  // Bottom-anchored slots (HOME bottom-center, bottom corners) must
  // render game-owned content ABOVE the identity+chip pill so the chip
  // bubble hugs the lower rail and card backs / hand region sit in
  // playable space above it. Top/middle slots keep the natural
  // identity → chip → content stack.
  const isBottomAnchored = slot === -1 || slot === -3 || slot === 0 || slot === 5;
  const isBottomPerimeterSeat = slot === 0 || slot === 5;

  // Wave 3C.3e — identity hugs the rail, gameplay points inward.
  // Derive default name placement from slot geometry:
  //   top seats     → NAME above CHIP
  //   bottom seats  → CHIP above NAME
  //   side seats    → horizontal row, name on OUTER side (slot 1 left,
  //                   slot 4 right)
  // Callers may still override via the `namePlacement` prop ('none' is
  // always respected); the derived value only fires when the caller
  // accepted the default ('above-chip').
  type SeatOrientation =
    | 'vertical-name-top'
    | 'vertical-name-bottom';
  // Wave 3C.3f — two layouts only:
  //   TOP + SIDE  → NameAbove
  //   BOTTOM      → NameBelow
  // Side seats (1, 4) intentionally use the vertical TOP layout so
  // the chip remains the primary artifact and the name attaches to
  // it the same way as the top corners.
  let seatOrientation: SeatOrientation;
  if (isBottomAnchored) seatOrientation = 'vertical-name-bottom';
  else seatOrientation = 'vertical-name-top';

  const effectiveNamePlacement: 'above-chip' | 'below-chip' | 'none' =
    namePlacement === 'none'
      ? 'none'
      : seatOrientation === 'vertical-name-bottom'
        ? 'below-chip'
        : 'above-chip';

  const chipBgClass = getParticipantChipBgClass(status);
  const chipFgClass = getParticipantChipFgClass(status);
  const chipRingClass = getParticipantChipRingClass(statusRing);

  // Inner/outer side resolution. The cluster knows the slot, so games
  // pass "innerDecoration" / "outerDecoration" without needing to
  // recompute which physical side that maps to.
  const isRightSide = isRightSideCanonicalSlot(slot);
  const innerSideClass = isRightSide
    ? 'left-0 -translate-x-full'
    : 'right-0 translate-x-full';
  const outerSideClass = isRightSide
    ? 'right-0 translate-x-full'
    : 'left-0 -translate-x-full';

  return (
    <div
      ref={rootRef}
      data-canonical-seat-cluster=""
      data-cluster-instance={clusterInstanceIdRef.current}
      data-provider-instance={providerInstanceId ?? ''}
      data-seat-position={position}
      data-seat-slot={slot}
      data-seat-status={status}
      data-owner-label={ownerLabel ?? ''}
      data-player-id={playerId ?? ''}
      className={cn(
        'absolute pointer-events-none flex gap-1',
        isBottomAnchored ? 'flex-col-reverse' : 'flex-col',
        placement.className,
        raiseClass,
        'transition-all duration-300',
        className,
      )}
      style={isBottomPerimeterSeat ? { marginBottom: 'var(--shell-seat-safe-bottom)' } : undefined}
    >
      {/* Felt-toned backdrop pill — wraps identity + chip only.
          Game-owned children sit OUTSIDE this pill so card geometry
          stays game-controlled. The pill keeps the cluster legible
          regardless of whether the slot lands on felt or chrome,
          replacing per-projection contrast hacks.

          Fixed canonical nameplate container. Width is constant so
          shell seat geometry does NOT shift based on player-name
          length. Long names truncate with ellipsis instead of
          stretching the pill. */}
      {!hideChipBubble && (() => {
        // Wave 3C.3c — stable footprint contract:
        //   1. Name row always reserves a fixed dealer-pip slot on the
        //      right so the name stays centered whether or not the
        //      player is dealer. No re-centering when the pip appears.
        //   2. The chip cell is a fixed 60×60 reservation rendered
        //      unconditionally (HUD-frame sized). chipPresentation
        //      controls CONTENTS, never the cell. 'hidden' renders an
        //      invisible placeholder; a ReactNode replacement renders
        //      INSIDE the reserved cell, centered. chipHUD wraps the
        //      cell contents in every state so the HUD frame is also
        //      stable.
        //   3. Pill `gap-2` separates name row from chip cell so the
        //      HUD halo cannot collide with the dealer pip / name.
        const nameRow = namePlacement === 'none' ? null : (
          <div
            data-canonical-seat-name-row=""
            className={cn(
              'grid items-center rounded-[3px] px-1 py-[1px] w-fit max-w-[88px]',
              'bg-black/75 backdrop-blur-sm border border-black/40',
            )}
            style={{ gridTemplateColumns: 'minmax(0,1fr) 8px' }}
          >
            <span
              className="text-[10px] text-white font-semibold truncate min-w-0 text-center leading-[1.05]"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >
              {name}
            </span>
            <div
              aria-hidden={!isDealer}
              className={cn(
                'w-2 h-2 rounded-full bg-red-600 border border-white flex items-center justify-center shrink-0 justify-self-end',
                !isDealer && 'invisible',
              )}
            >
              <span className="text-white font-bold text-[5px] leading-none">D</span>
            </div>
          </div>
        );

        // Default chip-disc node (chipPresentation === 'auto').
        const defaultChipDisc = (
          <div data-canonical-seat-status-ring={statusRing ?? ''} className="contents">
            <CanonicalChipDisc
              size="cluster"
              amount={null}
              bgClass={chipBgClass}
              ringClass={chipRingClass}
              folded={dimChip}
              clickable={!!onChipClick}
              onClick={onChipClick}
              positionAnchor={position}
            >
              <span className={cn('font-bold leading-none', chipFgClass)}>
                {chipValue}
              </span>
              {chipDiscChildren}
              {chipOverlay && (
                <div
                  data-canonical-seat-chip-overlay=""
                  className="absolute inset-0 pointer-events-none"
                >
                  {chipOverlay}
                </div>
              )}
              {innerDecoration && (
                <div
                  data-canonical-seat-decoration="inner"
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 pointer-events-auto',
                    innerSideClass,
                  )}
                >
                  {innerDecoration}
                </div>
              )}
              {outerDecoration && (
                <div
                  data-canonical-seat-decoration="outer"
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 pointer-events-auto',
                    outerSideClass,
                  )}
                >
                  {outerDecoration}
                </div>
              )}
            </CanonicalChipDisc>
          </div>
        );

        let chipContent: ReactNode;
        if (chipPresentation === 'hidden') {
          chipContent = <div className="w-10 h-10 invisible" aria-hidden />;
        } else if (chipPresentation === 'auto') {
          chipContent = defaultChipDisc;
        } else {
          chipContent = chipPresentation;
        }

        let chipCellContents: ReactNode = chipContent;
        if (chipHUD && isValidElement(chipHUD)) {
          // Inject size=40 so the HUD ring concentric-wraps the 40×40
          // cluster chip disc instead of painting a 48px ring offset
          // from the chip center. Children injection keeps the chip
          // body as the HUD's content.
          chipCellContents = cloneElement(
            chipHUD,
            { size: 40, children: chipContent } as never,
          );
        }

        // Reserved chip cell — sized to fit the HUD ring envelope
        // (size 40 + 8 padding = 48). The cell stays centered around
        // the chip disc so the HUD ring and chip share one center.
        const chipCell = (
          <div
            data-canonical-seat-chip-cell=""
            className="relative flex items-center justify-center w-12 h-12"
          >
            {chipCellContents}
          </div>
        );

        // Wave 3C.3f — exactly two layouts: NameAbove / NameBelow.
        // No horizontal side-seat variants.

        return (
          <div
            data-canonical-seat-pill=""
            data-canonical-seat-orientation={seatOrientation}
            className={cn(
              'relative flex flex-col items-center w-fit max-w-[88px]',
              // ~2px separation between name and chip; the pair must
              // read as ONE object.
              'gap-[2px]',
            )}
          >
            {avatar && (
              <div
                data-canonical-seat-avatar=""
                className="flex items-center justify-center"
              >
                {avatar}
              </div>
            )}
            {effectiveNamePlacement === 'above-chip' && nameRow}
            {chipCell}

            {scoreLine && (
              <span
                className="text-[10px] font-semibold text-poker-gold leading-none"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
              >
                {scoreLine}
              </span>
            )}
            {effectiveNamePlacement === 'below-chip' && nameRow}
          </div>
        );
      })()}


      {children && (
        <div data-canonical-seat-cluster-content="" className="flex flex-col items-center">
          {children}
        </div>
      )}
    </div>
  );
}
