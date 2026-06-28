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

import { cloneElement, isValidElement, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  getShellNameplateConfig,
  subscribeShellNameplate,
} from './shellNameplateConfig';
import { CanonicalChipDisc } from '@/components/canonicalShell/CanonicalChipDisc';
import { cn } from '@/lib/utils';
import {
  getCanonicalSlotPlacement,
  getCanonicalSlotRaiseClass,
  isRightSideCanonicalSlot,
} from './canonicalSlotPlacement';
import type { CanonicalSlot } from './seatAnchors';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { resolveSideAwareRowAnchor } from './sideAwareRowAnchor';
import { useChipTransportSuppressedSeats } from './ChipTransportProvider';
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
  /**
   * Wave 5D follow-up — slot-aware growth opt-in.
   *
   * When true AND the resolved slot is a bottom-anchored slot (the
   * bottom-center HOME pair or the bottom-perimeter corner seats),
   * game-owned children render ABOVE the chip instead of below. This
   * prevents card backs / exposed showdown cards from projecting
   * outward into the elliptical felt rail and clipping. Default
   * `false` preserves the uniform NAME / CHIP / ARTIFACTS stacking
   * for every other consumer.
   */
  growUpwardAtBottom?: boolean;
  /**
   * Wave P2 — 3-5-7 opponent showdown row placement (felt-relative).
   *
   * When provided, the cluster owns the placement of `children` in
   * its below-chip slot via a felt-relative anchor:
   *
   *   - attachment 'chip-centered' → translateX(-50%) self-anchor
   *     (legacy baseline; visually identical when dxPx=dyPx=0).
   *   - attachment 'outer-edge'    → translateX(0%) for left-side
   *     opponents, translateX(-100%) for right-side opponents
   *     (automatic mirroring, single placement object drives both).
   *
   *   dxPx / dyPx are RESOLVED PIXELS owned by the shell-level caller
   *   (computed once at MGT from canonical play geometry — felt
   *   width/height × xPctOfPlayfield / yPctOfPlayfield). Per-card
   *   size / overlap / fan cannot alter them by construction.
   *   The X sign is flipped here for right-side opponents so a single
   *   positive dxPx moves both sides INWARD toward felt center.
   *
   * Defaults: undefined → identical legacy behavior.
   */
  opponentShowdownPlacement?: {
    attachment: 'chip-centered' | 'inner-edge' | 'outer-edge';
    sprawlDirection: 'inward' | 'outward';
    dxPx: number;
    dyPx: number;
  };

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
  growUpwardAtBottom = false,
  opponentShowdownPlacement,
}: CanonicalSeatClusterProps) {
  // CHIP_RUNTIME_CONTINUITY hooks — must run unconditionally so the
  // mount/unmount events fire regardless of slot/self-suppression
  // outcomes. The conditional returns below early-out the render but
  // leave hook order stable.
  const anchors = useSeatAnchorsOptional();
  const suppressedSeats = useChipTransportSuppressedSeats();
  const transportSuppressed = suppressedSeats.has(position);
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

  // NAME PLATE INWARD CLAMP — name plates are always ABOVE the chip
  // (vertical position invariant) and HORIZONTALLY biased toward felt
  // center IFF the natural left-1/2 -translate-x-1/2 position would
  // clip the outer rail. Affects ONLY `data-canonical-seat-name-row`
  // via inline translateX; chip anchor, spotlight, decorations, card
  // backs, dealer pip, and overlays are not touched.
  const nameRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const MAX_BIAS_PX = 16;
    const SAFETY_PX = 4;
    const apply = () => {
      const el = nameRowRef.current;
      if (!el) return;
      el.style.transform = '';
      if (typeof document === 'undefined') return;
      const chip = document.querySelector(
        `[data-chip-center="${position}"]`,
      ) as HTMLElement | null;
      const felt =
        (document.querySelector('[data-canonical-felt-surface]') as HTMLElement | null) ??
        (document.querySelector('[data-canonical-shell-felt-frame]') as HTMLElement | null);
      if (!chip || !felt) return;
      const nameRect = el.getBoundingClientRect();
      const chipRect = chip.getBoundingClientRect();
      const feltRect = felt.getBoundingClientRect();
      if (nameRect.width === 0 || feltRect.width === 0) return;

      // Horizontal inward clamp — bias toward felt center if the natural
      // centered position would clip the outer felt rail.
      const chipCx = chipRect.left + chipRect.width / 2;
      const feltCx = feltRect.left + feltRect.width / 2;
      const inwardSign = feltCx >= chipCx ? 1 : -1;
      const leftOverflow = feltRect.left + SAFETY_PX - nameRect.left;
      const rightOverflow = nameRect.right - (feltRect.right - SAFETY_PX);
      let shiftX = 0;
      if (inwardSign > 0 && leftOverflow > 0) shiftX = leftOverflow;
      else if (inwardSign < 0 && rightOverflow > 0) shiftX = -rightOverflow;
      if (shiftX > MAX_BIAS_PX) shiftX = MAX_BIAS_PX;
      else if (shiftX < -MAX_BIAS_PX) shiftX = -MAX_BIAS_PX;

      // Vertical lift removed — top-seat clearance is now provided
      // structurally by the admin top safe area. The name row stays at
      // its natural fixed position above the chip.

      const parts: string[] = [];
      if (shiftX) parts.push(`translateX(${shiftX}px)`);
      el.style.transform = parts.join(' ');

    };
    apply();
    if (typeof window === 'undefined') return;
    const el = nameRowRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(apply);
      if (el) ro.observe(el);
      const felt =
        document.querySelector('[data-canonical-felt-surface]') ??
        document.querySelector('[data-canonical-shell-felt-frame]');
      if (felt) ro.observe(felt as Element);
      const header = document.querySelector('[data-canonical-shell-header]');
      if (header) ro.observe(header as Element);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('scroll', apply, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('scroll', apply, true);
    };
  }, [position, name, slot]);

  // Live chip-disc radius measurement — used by the opponent-showdown
  // row to pin to the *visible* chip rim (inner-edge / outer-edge)
  // instead of assuming a fixed 20px half-width. Reads the actual
  // [data-chip-center="${position}"] rect so future chip-disc sizing
  // changes flow through automatically. Falls back to 20px until the
  // first measurement lands.
  const [chipRadiusPx, setChipRadiusPx] = useState<number>(20);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const measure = () => {
      const chip = document.querySelector(
        `[data-chip-center="${position}"]`,
      ) as HTMLElement | null;
      if (!chip) return;
      const r = chip.getBoundingClientRect();
      if (r.width > 0) {
        const next = r.width / 2;
        setChipRadiusPx((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
      }
    };
    measure();
    if (typeof window === 'undefined') return;
    let ro: ResizeObserver | null = null;
    const chip = document.querySelector(
      `[data-chip-center="${position}"]`,
    ) as HTMLElement | null;
    if (chip && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(chip);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [position]);


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
  void isObserverProjection;
  // All seats use a single canonical placement contract. Both the
  // legacy `occupied-2p-face` rescue variant and the
  // `occupied-observer` HOME variant were retired alongside the
  // FACE_TO_FACE projection — seat topology is now normalized at the
  // dealer-game boundary, so every projection produces the correct
  // geometry without bespoke per-game offsets.
  const placement = getCanonicalSlotPlacement(slot, 'occupied');

  const raiseClass = raisePosition ? getCanonicalSlotRaiseClass(slot) : '';
  // Bottom-anchored slots (HOME bottom-center, bottom corners) must
  // render game-owned content ABOVE the identity+chip pill so the chip
  // bubble hugs the lower rail and card backs / hand region sit in
  // playable space above it. Top/middle slots keep the natural
  // identity → chip → content stack.
  const isBottomAnchored = slot === -1 || slot === -3 || slot === 0 || slot === 5;
  const isBottomPerimeterSeat = slot === 0 || slot === 5;

  // Wave 3C.4a — CHIP ANCHOR INVARIANT.
  //
  // The chip cell (w-10 h-10) is the ONLY element that participates in
  // slot anchoring. Everything else (name plate, score line, game-owned
  // children) is absolutely positioned relative to the chip cell so the
  // chip's `data-chip-center` rect is invariant regardless of which
  // siblings mount or unmount.
  //
  // VISUAL CONTRACT (uniform across every slot): the name row sits
  // ABOVE the chip, the chip is the invariant origin, and game-owned
  // gameplay artifacts ALWAYS emerge BELOW the chip — including the
  // bottom-row seats. Previously bottom seats flipped growth upward,
  // which produced NAME → ARTIFACT → CHIP stacking; the contract is
  // now NAME / CHIP / ARTIFACTS for every seat.
  // Default is uniform NAME / CHIP / ARTIFACTS stacking. Opt-in via
  // `growUpwardAtBottom` flips growth for bottom-anchored slots so
  // game-owned content (e.g. Holm showdown exposed cards) does not
  // project outward into the elliptical felt rail.
  const growsDown = !(growUpwardAtBottom && isBottomAnchored);


  type SeatOrientation = 'vertical-name-top';
  const seatOrientation: SeatOrientation = 'vertical-name-top';

  const effectiveNamePlacement: 'above-chip' | 'none' =
    namePlacement === 'none' ? 'none' : 'above-chip';

  const chipBgClass = getParticipantChipBgClass(status);
  const chipFgClass = getParticipantChipFgClass(status);
  const chipRingClass = getParticipantChipRingClass(statusRing);

  const isRightSide = isRightSideCanonicalSlot(slot);
  const innerSideClass = isRightSide
    ? 'left-0 -translate-x-full'
    : 'right-0 translate-x-full';
  const outerSideClass = isRightSide
    ? 'right-0 translate-x-full'
    : 'left-0 -translate-x-full';

  // Global Shell → Seat Cluster → Nameplate config drives max width
  // and X/Y offsets (relative to the chip-circle DIAMETER). X is
  // mirrored by side so positive = inward toward felt center for
  // BOTH left- and right-side opponent seats. Center-anchored slots
  // (HOME=-1, BOTTOM_RAIL=-3) collapse to 0 because "inward" has no
  // horizontal meaning there. These are computed unconditionally so
  // both the chip-cell render branch and the name-row wrapper below
  // share the same offset/maxWidth styles.
  const chipDiameterPx = chipRadiusPx * 2;
  const isCenterAnchoredSlot = slot === -1 || slot === -3;
  const inwardCssSignForName = isCenterAnchoredSlot ? 0 : (isRightSideCanonicalSlot(slot) ? -1 : 1);
  const namePlateMaxWidthStyle: CSSProperties = {
    maxWidth: `calc(var(--shell-nameplate-maxw-dia, 2.2) * ${chipDiameterPx}px)`,
  };
  // Chip-center-anchored placement contract:
  //   The nameplate's VISUAL CENTER sits at chip-circle center plus
  //   the signed (X,Y) offsets, expressed in chip DIAMETERS. X is
  //   mirrored per seat side so +X is always inward toward the felt
  //   center; Y is +down / -up. Default Y (-0.73) reproduces today's
  //   above-chip rendered placement; X=Y=0 puts the nameplate center
  //   directly over the chip center.
  const namePlateAnchoredStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform:
      `translate(-50%, -50%)` +
      ` translate(calc(var(--shell-nameplate-x-dia, 0) * ${chipDiameterPx}px * ${inwardCssSignForName}),` +
      ` calc(var(--shell-nameplate-y-dia, -0.73) * ${chipDiameterPx}px))`,
  };

  // Build chip-cell contents and name row.
  let chipCellContents: ReactNode = null;
  let nameRow: ReactNode = null;
  if (!hideChipBubble) {
    nameRow = namePlacement === 'none' ? null : (
      <div
        ref={nameRowRef}
        data-canonical-seat-name-row=""
        className={cn(
          'inline-flex items-center gap-1 rounded-[3px] px-1 py-[1px]',
          'bg-black/75 backdrop-blur-sm border border-black/40',
        )}
        style={namePlateMaxWidthStyle}
      >
        <span
          className="text-[10px] text-white font-semibold truncate min-w-0 leading-[1.05]"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
        >
          {name}
        </span>
      </div>
    );


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

    if (chipHUD && isValidElement(chipHUD)) {
      chipCellContents = cloneElement(
        chipHUD,
        { size: 40, children: chipContent } as never,
      );
    } else {
      chipCellContents = chipContent;
    }
  }

  // Above-chip stack: avatar + name.
  //
  // Canonical dealer affordance is rendered TANGENT to the nameplate on
  // its INNER side (toward the table center horizontally). Single home
  // for every game (poker, cribbage, gin, holm, 3-5-7); dice families
  // never pass isDealer={true}. The pip sits beside the name pill —
  // never above it — so the top-seat vertical clearance is unaffected
  // and the pip never competes with the chip, status ring, leg pips,
  // buck, emotes, or result badges (all of which live on/around the
  // chip cell below).
  //
  // Inner side resolution:
  //   - Left-side slots (0,1,2) → inner = RIGHT of name pill
  //   - Right-side slots (3,4,5) → inner = LEFT of name pill
  //   - Center / HOME / BOTTOM_RAIL → default to RIGHT
  const dealerInnerSideClass = isRightSide
    ? 'right-full'
    : 'left-full';
  const aboveChipNodes: ReactNode[] = [];
  if (!hideChipBubble) {
    if (avatar) {
      aboveChipNodes.push(
        <div
          key="avatar"
          data-canonical-seat-avatar=""
          className="flex items-center justify-center"
        >
          {avatar}
        </div>,
      );
    }
    // Nameplate is no longer stacked in the above-chip flow column —
    // it is rendered in its own chip-center-anchored absolute layer
    // (see render output below) so X/Y offsets describe the true
    // chip-center → nameplate-center vector. Avatar continues to live
    // in the above-chip column.
  }

  // Below-chip stack: score line (and children if growth DOWN).
  const belowChipNodes: ReactNode[] = [];
  if (!hideChipBubble && scoreLine) {
    belowChipNodes.push(
      <span
        key="score"
        className="text-[10px] font-semibold text-poker-gold leading-none whitespace-nowrap"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
      >
        {scoreLine}
      </span>,
    );
  }

  if (children) {
    const childrenNode = (
      <div
        key="children"
        data-canonical-seat-cluster-content=""
        className="flex flex-col items-center"
      >
        {children}
      </div>
    );
    if (growsDown) {
      belowChipNodes.push(childrenNode);
    } else {
      // Growth up — children render further from chip than name.
      aboveChipNodes.unshift(childrenNode);
    }
  }

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
      data-seat-orientation={seatOrientation}
      data-seat-growth={growsDown ? 'down' : 'up'}
      data-card-anchor={`seat-${position}`}
      className={cn(
        // CHIP ANCHOR INVARIANT — the outer wrapper is sized to the chip
        // cell only. Slot placement anchors this 40x40 box; name/score/
        // children project from it via absolute positioning and cannot
        // move the chip's [data-chip-center] rect.
        'absolute pointer-events-none w-10 h-10',
        placement.className,
        raiseClass,
        'transition-all duration-300',
        className,
      )}
      style={isBottomPerimeterSeat ? { marginBottom: 'var(--shell-seat-safe-bottom)' } : undefined}
    >
      {aboveChipNodes.length > 0 && (
        <div
          data-canonical-seat-above=""
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[2px] flex flex-col items-center gap-[2px] pointer-events-none"
          style={transportSuppressed ? { visibility: 'hidden' } : undefined}
        >
          {aboveChipNodes}
        </div>
      )}


      {/* Chip-center-anchored nameplate layer. Sits on top of the chip
          cell at chip-circle center plus the configured signed offsets
          (X mirrored per seat side). Replaces the prior above-chip
          stacked nameplate so stored values truthfully describe the
          chip-center → nameplate-center vector. */}
      {!hideChipBubble && effectiveNamePlacement === 'above-chip' && nameRow && (
        <div
          data-canonical-seat-nameplate-layer=""
          className="pointer-events-none"
          style={{
            ...namePlateAnchoredStyle,
            ...(transportSuppressed ? { visibility: 'hidden' as const } : null),
          }}
        >
          <div className="relative inline-flex items-center">
            {nameRow}
            {isDealer && (
              <div
                data-canonical-dealer-pip=""
                data-dealer-pip-active="true"
                aria-label="Dealer"
                title="Dealer"
                className={cn(
                  'absolute top-1/2 -translate-y-1/2',
                  dealerInnerSideClass,
                  'inline-flex items-center justify-center rounded-full',
                  'bg-red-600 border border-white shadow',
                  'w-5 h-5 text-[10px] font-bold text-white leading-none pointer-events-none',
                )}
              >
                D
              </div>
            )}
          </div>
        </div>
      )}
      {!hideChipBubble && (
        <div
          data-canonical-seat-pill=""
          data-canonical-seat-chip-cell=""
          data-chip-transport-suppressed={transportSuppressed ? 'true' : 'false'}
          className="absolute inset-0 flex items-center justify-center"
          style={transportSuppressed ? { visibility: 'hidden' } : undefined}
        >
          {chipCellContents}
        </div>
      )}

      {belowChipNodes.length > 0 && (() => {
        // P2 — opponent showdown row placement.
        // Self-alignment is resolved by the canonical side-aware
        // row-anchor resolver. Attachment names describe the VISIBLE
        // pinned edge of the row footprint, never literal render order.
        // Default (chip-centered, 0, 0) is byte-for-byte identical to
        // the legacy `left-1/2 -translate-x-1/2 mt-[2px]` baseline.
        let overrideStyle: CSSProperties | undefined;
        if (opponentShowdownPlacement) {
          const { attachment, sprawlDirection, dxPx, dyPx } = opponentShowdownPlacement;
          // Bottom-center / local seat (HOME=-1, BOTTOM_RAIL=-3) has no
          // meaningful left/right table-edge: force chip-centered and
          // ignore the side-aware X offset. Card size, overlap, fan,
          // fan arch, and Y placement are unaffected — they live on the
          // cards themselves and dyPx.
          const isBottomCenterSeat = slot === -1 || slot === -3;
          if (isBottomCenterSeat) {
            overrideStyle = {
              transform: `translate(-50%, 0) translate(0px, ${dyPx}px)`,
            };
          } else {
            const { selfTranslateX, anchorInwardMagnitude } = resolveSideAwareRowAnchor(
              isRightSide ? 'right' : 'left',
              attachment,
              sprawlDirection,
            );
            // Felt-relative INWARD direction in CSS X:
            //   left-side opponent  → +CSS X
            //   right-side opponent → -CSS X
            const inwardCssSign = isRightSide ? -1 : 1;
            // User offset (+X = inward) flipped per side so a single
            // positive dxPx moves both sides inward.
            const signedDx = inwardCssSign * dxPx;
            // Chip-rim offset uses the LIVE measured chip-disc radius so
            // inner-edge / outer-edge pin to the visible circle rim, not
            // a hardcoded 20px half of the w-10 cell.
            const anchorOffsetCssX =
              inwardCssSign * anchorInwardMagnitude * chipRadiusPx;
            const totalCssX = signedDx + anchorOffsetCssX;
            overrideStyle = {
              transform: `translate(${selfTranslateX}, 0) translate(${totalCssX}px, ${dyPx}px)`,
            };
          }
        }

        const baseClass = opponentShowdownPlacement
          ? 'absolute top-full left-1/2 mt-[2px] flex flex-col items-center gap-[2px] pointer-events-none'
          : 'absolute top-full left-1/2 -translate-x-1/2 mt-[2px] flex flex-col items-center gap-[2px] pointer-events-none';
        return (
          <div
            data-canonical-seat-below=""
            className={baseClass}
            style={{
              ...(transportSuppressed ? { visibility: 'hidden' as const } : null),
              ...(overrideStyle ?? null),
            }}
          >
            {belowChipNodes}
          </div>
        );
      })()}
    </div>
  );
}
