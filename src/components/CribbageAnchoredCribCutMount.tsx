/**
 * Wave 5D — CribCutGroup Graduation (mount placement) +
 * Wave 5D.1 — Internal Content Contract.
 *
 * This component exists for two reasons:
 *
 * 1. To mount the anchored cribCutGroup slot OUTSIDE the
 *    `transform: translateY(6%)` felt-content wrapper in
 *    CribbageMobileGameTable (see WAVE 5 INVARIANT in
 *    `src/components/Wave4CribCutGroupSlot.tsx`).
 *
 * 2. To enforce the Wave 5 Internal Content Contract:
 *
 *      compositeChildrenBounds  ⊆  assignedRect
 *
 *    The anchored stage `cribbage.cribCutGroup` owns:
 *      - anchor / widthPct / aspectRatio / assignedRect
 *    The crib child owns:
 *      - pile layout (fan of face-down cards)
 *    The cut child owns:
 *      - artwork only (the playing card + label)
 *    Neither child owns absolute pixel size. Both derive size from
 *    `assignedRect.heightPx` so the composite fits inside the stage on
 *    every viewport bucket (SE portrait, mini portrait, regular portrait,
 *    landscape, observer).
 *
 *    `useChildrenBoundsContract` measures both children and emits
 *    `wave5:children_exceed_stage` if the composite ever exceeds the
 *    stage. The framework does NOT clip, hide, or auto-shrink — the only
 *    correct fix for a violation is to tune the ratios below.
 *
 * Future anchored stages (PeggingRow, KnockDisplay,
 * YahtzeeOpponentDiceStage, Holm pot, Gin discard, etc.) MUST inherit
 * this same pattern: derive child sizes from `assignedRect.heightPx`,
 * install `useChildrenBoundsContract`, never size children in absolute
 * pixels.
 */

import { useEffect, useRef } from 'react';
import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import { Wave4CribCutGroupSlot } from './Wave4CribCutGroupSlot';
import { useCribbageGameplayGeometry } from '@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';
import { useChildrenBoundsContract } from '@/lib/wave5GameplayGeometry/useChildrenBoundsContract';
import { toVmin } from '@/lib/wave4LayoutResolver';
import { useCardOverlap } from '@/lib/geometryLab/cardArtifactOverlap';
import { emitCribLabelWartimeEvent } from '@/lib/cribbage/cribLabelWartimeLedger';


const CRIB_CUT_GROUP_ID = 'cribbage.cribCutGroup';

// ── Wave 5D.1 sizing ratios (all relative to assignedRect.heightPx) ─────
// Stage height is split between: top label ("Crib"/"Cut") + card artwork.
// Card aspect is 2:3 (width = height * 2/3) per CribbagePlayingCard.
const CUT_CARD_HEIGHT_RATIO = 0.78;  // cut card occupies 78% of stage height
const CRIB_CARD_HEIGHT_RATIO = 0.55; // crib pile cards are 55% of stage height
const CARD_ASPECT = 2 / 3;            // width / height

export interface CribbageAnchoredCribCutMountProps {
  cribbageState: CribbageState;
  cardBackColors: { color: string; darkColor: string };
  handBoundaryKey?: string;
  terminalPath?:
    | 'pegging'
    | 'counting'
    | 'hand-counting'
    | 'crib-counting'
    | 'fallback'
    | null;
  countingOutroActive?: boolean;
  /**
   * Presentation-owned crib card count. The parent tracks how many
   * crib discard-to-crib transports have visually settled and passes
   * that count here. This artifact renders EXACTLY this many cardbacks
   * regardless of authoritative `crib.length`, so incoming cardbacks
   * never appear before their transport lands.
   *
   * If undefined, falls back to authoritative `crib.length` (legacy).
   */
  visibleCribCount?: number;
  /**
   * Follow-up polish — when true, the cut card artwork is hidden even
   * if `cribbageState.cutCard` is present. Used by the game table to
   * defer the flip animation until all in-flight crib discard transports
   * have settled (see `discardsSettledInHand` gate). Purely presentation:
   * authoritative `cribbageState.cutCard` is unchanged.
   */
  deferCutReveal?: boolean;
  /**
   * Display name of the current crib owner (dealer). Rendered as
   * "Crib: {dealerDisplayName}" as felt text centered over the crib
   * parked position. Purely presentational — undefined/null suppresses
   * the name suffix and just renders "Crib".
   */
  dealerDisplayName?: string | null;
  /**
   * Wartime instrumentation only — identifies the dealer whose crib is
   * displayed, so trace events can correlate label decisions to seat/
   * player identity in published-runtime bug reports. Not used for
   * rendering.
   */
  dealerPlayerId?: string | null;
  /**
   * Reserved parked-crib layout size in cards. Only 0, 2, or 4 are valid
   * (never 1/3/5/6). Parent computes this as the intended FINAL crib
   * layout for the current transport / discard phase, so:
   *   - before first pair lands → 2 (2-card centered layout)
   *   - before second pair lands → 4 (4-card layout; parked cards shift
   *     to slots 1 & 2, transport targets slots 3 & 4)
   *   - counting / pre-deal → 0 (crib not parked)
   * If undefined, falls back to a snap of `crib.length` to {0,2,4}.
   */
  reservedCribLayoutCount?: 0 | 2 | 4;
}

export function CribbageAnchoredCribCutMount({
  cribbageState,
  cardBackColors,
  handBoundaryKey,
  terminalPath = null,
  countingOutroActive = false,
  visibleCribCount,
  deferCutReveal = false,
  dealerDisplayName = null,
  dealerPlayerId = null,
  reservedCribLayoutCount,
}: CribbageAnchoredCribCutMountProps) {
  // --- gating logic mirrored from CribbageFeltContent ---
  const phaseForLayout = countingOutroActive ? 'pegging' : cribbageState.phase;

  const isCountingTerminalPath =
    terminalPath === 'counting' ||
    terminalPath === 'hand-counting' ||
    terminalPath === 'crib-counting';

  const isPeggingWin =
    phaseForLayout === 'complete' &&
    (terminalPath === 'pegging' ||
      (terminalPath === null && !cribbageState.lastHandCount));

  const isCountingPhase =
    (phaseForLayout === 'counting' ||
      (phaseForLayout === 'complete' && !!cribbageState.lastHandCount) ||
      (phaseForLayout === 'complete' && isCountingTerminalPath) ||
      (phaseForLayout === 'complete' && terminalPath === 'fallback')) &&
    !isPeggingWin;

  const showCribOnFelt =
    cribbageState.crib.length > 0 &&
    !isCountingPhase &&
    !isPeggingWin &&
    phaseForLayout !== 'complete';

  const visible =
    (showCribOnFelt || cribbageState.cutCard) && !isCountingPhase && !isPeggingWin;

  // ── Wave 5D.1: derive child sizes from stage assignedRect ─────────────
  const { placementsById, lastValidPlacementsById } = useCribbageGameplayGeometry();
  const { vminInPx } = useLiveGeometryConstraints();

  const current = placementsById.get(CRIB_CUT_GROUP_ID);
  const lastValid = lastValidPlacementsById.get(CRIB_CUT_GROUP_ID);
  const placement = current && current.visible ? current : lastValid;

  const assignedRect = placement
    ? {
        x: toVmin(placement.rect.x, vminInPx),
        y: toVmin(placement.rect.y, vminInPx),
        width: toVmin(placement.rect.width, vminInPx),
        height: toVmin(placement.rect.height, vminInPx),
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  const stageHeightPx = assignedRect.height * vminInPx;
  const stageWidthPx = assignedRect.width * vminInPx;

  // Card sizing — width derives from height via CARD_ASPECT so widthPx
  // (the prop CribbagePlayingCard understands) produces the correct height.
  const cutCardHeightPx = Math.max(8, stageHeightPx * CUT_CARD_HEIGHT_RATIO);
  const cutCardWidthPx = cutCardHeightPx * CARD_ASPECT;

  const cribCardHeightPx = Math.max(6, stageHeightPx * CRIB_CARD_HEIGHT_RATIO);
  const cribCardWidthPx = cribCardHeightPx * CARD_ASPECT;

  // Geometry-Lab–owned overlap/gap (independent of scoring-hand values).
  // fanOverlap normalized to crib card width: nextCardOffset = w * (1 - overlap)
  const cribFanOverlap = useCardOverlap('cardOverlap.cribbage.cribFan');
  const cribToCutGap = useCardOverlap('cardOverlap.cribbage.cribToCutGap');
  const cribCardOverlapPx = cribCardWidthPx * cribFanOverlap;
  const cribToCutGapPx = cribCardWidthPx * cribToCutGap;

  // ── Crib-owner label geometry ────────────────────────────────────────
  // Label lifecycle: whenever the crib is parked beside the cut card
  // (before/during/after discards). Hidden during counting and after a
  // pegging win. Uses the same phase gates as the crib presentation.
  const cribParked =
    !isCountingPhase && !isPeggingWin && phaseForLayout !== 'complete';

  // Reserved parked-crib layout count. Once the crib is parked we ALWAYS
  // reserve the full 4-card footprint (regardless of authoritative
  // crib.length or the parent-supplied hint), so:
  //   - All four `crib-slot-{1..4}` anchors exist BEFORE the first
  //     discard transport launches.
  //   - Anchor positions do not shift when the visible crib count
  //     changes (0 → 2 → 4) or when the cut card is revealed.
  //   - Transports resolve their per-card destinations from the same
  //     final parked layout the render will use, eliminating post-settle
  //     horizontal correction.
  // The parent-provided `reservedCribLayoutCount` prop is kept in the
  // signature for backwards compatibility but no longer varies the
  // reservation; the parked footprint is invariant across the parked
  // lifecycle.
  void reservedCribLayoutCount;
  const reservedCount: 0 | 2 | 4 = cribParked ? 4 : 0;

  // Crib-group container width for the reserved layout. The full 4-card
  // footprint is the only value ever rendered during the parked
  // lifecycle, which keeps the outer flex row [cribGroup | gap | cutCard]
  // width stable and therefore keeps the crib-group CENTER at a fixed
  // offset from the slot center for the entire parked lifecycle.
  const cribGroup4CardWidthPx = Math.max(
    0,
    4 * cribCardWidthPx - 3 * cribCardOverlapPx,
  );
  const cribGroupWidthPx = reservedCount === 4 ? cribGroup4CardWidthPx : 0;

  // Label anchor. Under `justify-content: center` on the Wave4CribCutGroupSlot
  // flex row with a fixed 4-card cribGroup + gap + cutCard cluster, the
  // crib-group CENTER sits at:
  //   slotCenterX - (gap + cutCardWidth) / 2
  // — stable across 0/2/4 admitted cards.
  const cribCenterInSlotPx =
    stageWidthPx / 2 - (cribToCutGapPx + cutCardWidthPx) / 2;

  // Label container. The label is FELT TEXT, not gameplay chrome — it
  // does not participate in crib/cut layout and is not constrained by
  // the crib artifact. Reserve the maximum safe horizontal space
  // bounded by:
  //   left  = left edge of the playable felt (felt-frame origin)
  //   right = left edge of the cut card
  // In slot-local px coordinates:
  //   feltLeftInSlot  = -assignedRect.x * vminInPx
  //   cutLeftInSlot   = slotCenter + cribGroup4W/2 + gap/2 - cutW/2
  // Anchor the text visually over the crib-group center; the container
  // grows symmetrically until it hits whichever boundary is tighter, so
  // the text stays centered over the crib and only ellipsizes when the
  // full string genuinely cannot fit inside the safe region.
  const feltLeftInSlotPx = -assignedRect.x * vminInPx;
  const cutLeftInSlotPx =
    stageWidthPx / 2 + cribGroup4CardWidthPx / 2 + cribToCutGapPx / 2 - cutCardWidthPx / 2;
  const leftSafePx = Math.max(0, cribCenterInSlotPx - feltLeftInSlotPx);
  const rightSafePx = Math.max(0, cutLeftInSlotPx - cribCenterInSlotPx);
  const labelContainerWidthPx = 2 * Math.min(leftSafePx, rightSafePx);
  // Fixed font size (viewport-responsive via stageHeight but content-
  // independent — never grows/shrinks with name length).
  const labelFontPx = Math.max(9, Math.round(stageHeightPx * 0.16));
  const labelText = dealerDisplayName
    ? `Crib: ${dealerDisplayName}`
    : 'Crib';



  const cribRef = useRef<HTMLDivElement | null>(null);
  const cutRef = useRef<HTMLDivElement | null>(null);

  // Presentation-owned visible count — clamped to reservedCount so a
  // stale visibleCribCount can never render more cardbacks than the
  // reserved layout has slots for.
  const resolvedVisibleCribCount = Math.max(
    0,
    Math.min(
      reservedCount,
      Math.min(
        cribbageState.crib.length,
        visibleCribCount ?? cribbageState.crib.length,
      ),
    ),
  );

  useChildrenBoundsContract({
    artifactId: CRIB_CUT_GROUP_ID,
    assignedRect,
    vminInPx,
    enabled: !!placement && !!placement.visible && vminInPx > 0 && !!visible,
    children: [
      { id: 'crib', ref: cribRef },
      { id: 'cut', ref: cutRef },
    ],
  });

  // Absolutely-positioned crib-owner felt label. Kept as a shared node so
  // both the empty-slot branch and the populated-slot branch render an
  // identical label. Left/width reserve the crib-side region of the
  // stage; the container itself does not shift with crib-card count and
  // never encroaches on the cut card or the crib+cut gap. Truncation
  // uses the canonical `truncate` utility (matches scoring-rail player
  // labels) so long names ellipsize instead of resizing the container
  // or shifting geometry.
  const cribOwnerLabel = cribParked && !!dealerDisplayName ? (
    <div
      data-crib-owner-label=""
      className="pointer-events-none absolute"
      style={{
        left: `${cribCenterInSlotPx}px`,
        top: 0,
        width: `${labelContainerWidthPx}px`,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        zIndex: 1,
      }}
    >
      <span
        className="text-white block leading-none"
        style={{
          fontSize: `${labelFontPx}px`,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {labelText}
      </span>
    </div>
  ) : null;

  const labelEmitted = cribOwnerLabel !== null;
  const renderBranch = !visible
    ? 'empty-slot'
    : (showCribOnFelt && resolvedVisibleCribCount > 0)
      ? 'crib-pile+cut'
      : 'cut-only';

  // ── Wartime instrumentation — read-only ──────────────────────────────
  // Emit the label render decision on every meaningful change so we can
  // reconstruct why the "Crib: {dealer}" text does or does not appear.
  emitCribLabelWartimeEvent(
    'crib_owner_label_decision',
    {
      dealerPlayerId: dealerPlayerId ? dealerPlayerId.slice(0, 8) : null,
      dealerDisplayName,
      labelText,
      cribParked,
      isCountingPhase,
      isPeggingWin,
      phaseForLayout,
      showCribOnFelt,
      visible,
      labelContainerWidthPx: Math.round(labelContainerWidthPx * 100) / 100,
      stageWidthPx: Math.round(stageWidthPx * 100) / 100,
      stageHeightPx: Math.round(stageHeightPx * 100) / 100,
      cutCardWidthPx: Math.round(cutCardWidthPx * 100) / 100,
      cribToCutGapPx: Math.round(cribToCutGapPx * 100) / 100,
      renderBranch,
      labelEmitted,
      placementResolved: !!placement && !!placement.visible,
      vminInPx: Math.round(vminInPx * 100) / 100,
    },
    {
      // Dedupe on the identity of the decision. Numeric px are rounded
      // to whole units for the signature only, so sub-pixel jitter does
      // not spam.
      signature: [
        dealerPlayerId ?? 'null',
        dealerDisplayName ?? 'null',
        cribParked ? 1 : 0,
        isCountingPhase ? 1 : 0,
        isPeggingWin ? 1 : 0,
        phaseForLayout,
        showCribOnFelt ? 1 : 0,
        visible ? 1 : 0,
        renderBranch,
        labelEmitted ? 1 : 0,
        Math.round(labelContainerWidthPx),
        Math.round(stageWidthPx),
        Math.round(cutCardWidthPx),
        Math.round(cribToCutGapPx),
      ].join('|'),
    },
  );

  const labelDomWatchRef = useRef<{ present: boolean | null; sig: string }>({
    present: null,
    sig: '',
  });

  const parkedGroupWatchRef = useRef<string>('');
  const labelCoverWatchRef = useRef<string>('');
  const cutLifecycleWatchRef = useRef<string>('');

  const rectOf = (el: Element | null) => {
    if (!el) return null;
    const r = (el as HTMLElement).getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      centerX: Math.round(r.left + r.width / 2),
      centerY: Math.round(r.top + r.height / 2),
    };
  };

  useEffect(() => {
    // Query the actual committed DOM for the label marker so we can
    // report whether the JSX we thought we emitted actually reached the
    // page (and how the browser resolved its computed styles / rect).
    const raf = requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>('[data-crib-owner-label]');
      const slot = document.querySelector<HTMLElement>('[data-card-anchor="crib"]');
      let computed: {
        color: string;
        opacity: string;
        visibility: string;
        display: string;
      } | null = null;
      let rect: { x: number; y: number; width: number; height: number } | null = null;
      if (node) {
        const cs = window.getComputedStyle(node);
        computed = {
          color: cs.color,
          opacity: cs.opacity,
          visibility: cs.visibility,
          display: cs.display,
        };
        const r = node.getBoundingClientRect();
        rect = {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }
      const slotRect = rectOf(slot);
      const present = !!node;
      const sig = [
        present ? 1 : 0,
        computed ? `${computed.color}|${computed.opacity}|${computed.visibility}|${computed.display}` : 'null',
        rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : 'null',
        slotRect ? `${slotRect.x},${slotRect.y},${slotRect.width},${slotRect.height}` : 'null',
        labelEmitted ? 1 : 0,
      ].join('|');
      if (labelDomWatchRef.current.sig !== sig) {
        labelDomWatchRef.current = { present, sig };
        emitCribLabelWartimeEvent('crib_owner_label_dom_changed', {
          dealerPlayerId: dealerPlayerId ? dealerPlayerId.slice(0, 8) : null,
          labelEmitted,
          domPresent: present,
          computedColor: computed?.color ?? null,
          computedOpacity: computed?.opacity ?? null,
          computedVisibility: computed?.visibility ?? null,
          computedDisplay: computed?.display ?? null,
          labelRect: rect,
          slotRect,
          renderBranch,
        });

        // Contradiction: label is expected (crib parked, dealer name
        // resolved, JSX emitted) but the DOM node is missing / zero-
        // sized / hidden / transparent.
        const opacityNum = computed ? parseFloat(computed.opacity) : NaN;
        const effectivelyInvisible =
          !present ||
          (rect ? rect.width === 0 || rect.height === 0 : true) ||
          computed?.display === 'none' ||
          computed?.visibility === 'hidden' ||
          (Number.isFinite(opacityNum) && opacityNum < 0.05);
        if (
          cribParked &&
          !!dealerDisplayName &&
          labelEmitted &&
          effectivelyInvisible
        ) {
          emitCribLabelWartimeEvent('crib_owner_label_expected_but_dom_missing', {
            dealerPlayerId: dealerPlayerId ? dealerPlayerId.slice(0, 8) : null,
            dealerDisplayName,
            reason:
              !present
                ? 'dom-node-absent'
                : rect && (rect.width === 0 || rect.height === 0)
                  ? 'zero-sized'
                  : computed?.display === 'none'
                    ? 'display-none'
                    : computed?.visibility === 'hidden'
                      ? 'visibility-hidden'
                      : 'transparent',
            labelRect: rect,
            slotRect,
            computedColor: computed?.color ?? null,
            computedOpacity: computed?.opacity ?? null,
            computedVisibility: computed?.visibility ?? null,
            computedDisplay: computed?.display ?? null,
            renderBranch,
          });
        }
      }

      // ── Parked crib-group rect watch ────────────────────────────────
      const parkedGroup = document.querySelector<HTMLElement>('[data-parked-crib-group]');
      const cutEl = cutRef.current;
      const groupRect = rectOf(parkedGroup);
      const cutRect = rectOf(cutEl);
      const cardEls = parkedGroup
        ? Array.from(parkedGroup.querySelectorAll<HTMLElement>('[data-canonical-card-back], img, svg'))
        : [];
      const cardRects = cardEls.map((el) => rectOf(el)).filter(Boolean);
      const renderedCribCardCount = resolvedVisibleCribCount;
      const psig = [
        renderedCribCardCount,
        groupRect ? `${groupRect.centerX},${groupRect.centerY},${groupRect.width}` : 'null',
        slotRect ? `${slotRect.x},${slotRect.width}` : 'null',
        cutRect ? `${cutRect.centerX}` : 'null',
      ].join('|');
      if (parkedGroupWatchRef.current !== psig) {
        parkedGroupWatchRef.current = psig;
        emitCribLabelWartimeEvent('parked_crib_group_rect_changed', {
          renderedCribCardCount,
          renderBranch,
          groupRect,
          groupCenter: groupRect ? { x: groupRect.centerX, y: groupRect.centerY } : null,
          slotRect,
          cutRect,
          cribToCutGapPx: Math.round(cribToCutGapPx),
          cardRects,
          handBoundaryKey: handBoundaryKey ?? null,
        });
      }

      // ── Label covering / containing-block probe ────────────────────
      // Sample the topmost element at the label's visual center and the
      // label's parent chain up to `[data-canonical-felt-surface]`, so
      // an invisible label with `labelEmitted:true` can be attributed
      // to overlay coverage, transformed ancestors, clipping, or a
      // containing-block change that source alone cannot explain.
      if (node && rect && rect.width > 0 && rect.height > 0) {
        const cx = Math.round(rect.x + rect.width / 2);
        const cy = Math.round(rect.y + rect.height / 2);
        const top = document.elementFromPoint(cx, cy) as HTMLElement | null;
        const topIsLabel =
          !!top && (top === node || node.contains(top) || top.closest('[data-crib-owner-label]') === node);
        const parent = node.parentElement;
        const parentCs = parent ? window.getComputedStyle(parent) : null;
        const surface = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
        const surfaceRect = rectOf(surface);
        const insideSurface = !!surfaceRect &&
          rect.x >= surfaceRect.x &&
          rect.y >= surfaceRect.y &&
          rect.x + rect.width <= surfaceRect.x + surfaceRect.width &&
          rect.y + rect.height <= surfaceRect.y + surfaceRect.height;
        const topDesc = top
          ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}${
              top.getAttribute('data-artifact-id') ? '[' + top.getAttribute('data-artifact-id') + ']' : ''
            }${top.className && typeof top.className === 'string' ? '.' + top.className.split(/\s+/).slice(0, 2).join('.') : ''}`
          : 'null';
        const csig = [
          topIsLabel ? 1 : 0,
          topDesc,
          insideSurface ? 1 : 0,
          parentCs ? `${parentCs.transform}|${parentCs.overflow}|${parentCs.clipPath}` : 'null',
          phaseForLayout,
          renderBranch,
        ].join('|');
        if (labelCoverWatchRef.current !== csig) {
          labelCoverWatchRef.current = csig;
          emitCribLabelWartimeEvent('crib_owner_label_cover_probe', {
            phaseForLayout,
            renderBranch,
            labelCenter: { x: cx, y: cy },
            topAtCenter: topDesc,
            topOuterHTMLHead: top ? top.outerHTML.slice(0, 160) : null,
            topDataAttrs: top
              ? Object.fromEntries(
                  Array.from(top.attributes)
                    .filter((a) => a.name.startsWith('data-'))
                    .map((a) => [a.name, a.value]),
                )
              : null,
            topIsLabel,
            insideSurface,
            surfaceRect,
            labelRect: rect,
            parentTag: parent ? parent.tagName.toLowerCase() : null,
            parentTransform: parentCs?.transform ?? null,
            parentOverflow: parentCs?.overflow ?? null,
            parentClipPath: parentCs?.clipPath ?? null,
            parentZIndex: parentCs?.zIndex ?? null,
          });
          if (labelEmitted && cribParked && !!dealerDisplayName && !topIsLabel) {
            emitCribLabelWartimeEvent('crib_owner_label_covered', {
              dealerPlayerId: dealerPlayerId ? dealerPlayerId.slice(0, 8) : null,
              phaseForLayout,
              renderBranch,
              labelCenter: { x: cx, y: cy },
              coveringElement: topDesc,
              coveringOuterHTMLHead: top ? top.outerHTML.slice(0, 200) : null,
              coveringDataAttrs: top
                ? Object.fromEntries(
                    Array.from(top.attributes)
                      .filter((a) => a.name.startsWith('data-'))
                      .map((a) => [a.name, a.value]),
                  )
                : null,
            });
          }
          if (labelEmitted && cribParked && !!dealerDisplayName && !insideSurface) {
            emitCribLabelWartimeEvent('crib_owner_label_outside_surface', {
              dealerPlayerId: dealerPlayerId ? dealerPlayerId.slice(0, 8) : null,
              phaseForLayout,
              renderBranch,
              labelRect: rect,
              surfaceRect,
            });
          }
        }
      }

      // ── Cut-card lifecycle sample ─────────────────────────────────
      // Attribute transient cut-card collapses to the exact branch that
      // produced them. Fires on any change to the gating inputs, phase,
      // or measured cut rect.
      const cutEl2 = cutRef.current;
      const cutRectSample = rectOf(cutEl2);
      const cutChildCount = cutEl2 ? cutEl2.childElementCount : 0;
      const renderedCutBranch = !cribParked
        ? 'unmounted'
        : cutEligible
          ? 'reveal'
          : 'placeholder';
      const csig2 = [
        phaseForLayout,
        renderBranch,
        renderedCutBranch,
        cutRevealActive ? 1 : 0,
        deferCutReveal ? 1 : 0,
        !!cribbageState.cutCard ? 1 : 0,
        cutRectSample ? `${cutRectSample.width}x${cutRectSample.height}` : 'null',
        cutChildCount,
      ].join('|');
      if (cutLifecycleWatchRef.current !== csig2) {
        cutLifecycleWatchRef.current = csig2;
        emitCribLabelWartimeEvent('cut_card_lifecycle_sample', {
          phaseForLayout,
          renderBranch,
          renderedCutBranch,
          cutRevealActive,
          deferCutReveal,
          hasAuthoritativeCutCard: !!cribbageState.cutCard,
          cutRect: cutRectSample,
          cutChildCount,
        });
        // Contradiction: authoritative cut card exists, reveal is active,
        // but the visible cut wrapper is zero-sized.
        if (
          cutRevealActive &&
          !!cribbageState.cutCard &&
          cutRectSample &&
          (cutRectSample.width === 0 || cutRectSample.height === 0)
        ) {
          emitCribLabelWartimeEvent('cut_card_collapsed_while_eligible', {
            phaseForLayout,
            renderBranch,
            renderedCutBranch,
            deferCutReveal,
            cutRect: cutRectSample,
          });
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  });


  // ── Parked crib-group render ─────────────────────────────────────────
  // Always render the crib-group container inside the flex row when the
  // crib is "parked" (i.e. `cribParked`). This gives the outer flex
  // cluster a stable [cribGroup | gap | cutCard] shape so:
  //
  //   1. The label anchor at `slotCenter - (gap + cutW)/2` is stable
  //      across 0/2/4 admitted cards.
  //   2. The transport can resolve per-card slot anchors
  //      `[data-card-anchor="crib-slot-{n}"]` for n = 1..reservedCount
  //      BEFORE any card is admitted.
  //   3. The second-pair reservation (reservedCount = 4) shifts the two
  //      already-admitted cards into slots 1 & 2 of the final 4-card
  //      layout BEFORE the incoming transport lands, so the incoming
  //      cards settle exactly where their transport ended.
  //
  // Valid `reservedCount` values are 0, 2, 4 — never 1/3/5/6.
  const renderedCribGroup = cribParked && reservedCount > 0 && cribGroupWidthPx > 0 ? (
    <div
      ref={cribRef}
      data-parked-crib-group=""
      style={{
        position: 'relative',
        width: `${cribGroupWidthPx}px`,
        height: `${cribCardHeightPx}px`,
        flex: '0 0 auto',
      }}
    >
      {Array.from({ length: reservedCount }).map((_, i) => {
        const ordinal = i + 1;
        const slotLeftPx = i * (cribCardWidthPx - cribCardOverlapPx);
        const showCard = i < resolvedVisibleCribCount;
        return (
          <div
            key={ordinal}
            data-card-anchor={`crib-slot-${ordinal}`}
            data-artifact-id="cribbage.parkedCribSlot"
            style={{
              position: 'absolute',
              left: `${slotLeftPx}px`,
              top: 0,
              width: `${cribCardWidthPx}px`,
              height: `${cribCardHeightPx}px`,
            }}
          >
            {showCard && (
              <CanonicalCardBack
                widthPx={cribCardWidthPx}
                heightPx={cribCardHeightPx}
                variant="flat"
                radiusPx={2}
              />
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  // Cut-card slot. Always reserve the cut-card footprint during the
  // parked lifecycle so the [cribGroup | gap | cutCard] cluster width
  // (and therefore every crib-slot anchor position) is invariant BEFORE
  // any card lands and BEFORE the visual cut reveal. If the authoritative
  // `cutCard` has not resolved yet, render an equivalently-sized
  // placeholder so layout space is held; the visual reveal happens the
  // moment `cribbageState.cutCard` becomes available.
  const cutRevealActive =
    !!cribbageState.cutCard && !isCountingPhase && !isPeggingWin;
  // A settled visible cut card must never be replaced by a null-returning
  // CribbageCutCardReveal. When `deferCutReveal` is true we render the
  // same hidden placeholder used pre-reveal, preserving geometry without
  // collapsing the wrapper to 0×0.
  const cutEligible = cutRevealActive && !deferCutReveal;
  const renderedCutCard = cribParked ? (
    <div ref={cutRef} data-cribbage-cut-card="">
      {cutEligible ? (
        <CribbageCutCardReveal
          card={cribbageState.cutCard}
          cardBackColors={cardBackColors}
          handBoundaryKey={handBoundaryKey}
          widthPx={cutCardWidthPx}
          labelInFlow={false}
        />
      ) : (
        <div
          aria-hidden
          data-cribbage-cut-card-placeholder=""
          style={{
            width: `${cutCardWidthPx}px`,
            height: `${cutCardHeightPx}px`,
            visibility: 'hidden',
          }}
        />
      )}
    </div>
  ) : null;

  return (
    <Wave4CribCutGroupSlot
      styleVars={{ ['--cribcut-gap' as string]: `${cribToCutGapPx}px` }}
    >
      {cribOwnerLabel}
      {renderedCribGroup}
      {renderedCutCard}
    </Wave4CribCutGroupSlot>
  );
}



export default CribbageAnchoredCribCutMount;
