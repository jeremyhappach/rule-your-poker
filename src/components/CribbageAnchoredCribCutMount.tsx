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

import { useRef } from 'react';
import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import { Wave4CribCutGroupSlot } from './Wave4CribCutGroupSlot';
import { useCribbageGameplayGeometry } from '@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';
import { useChildrenBoundsContract } from '@/lib/wave5GameplayGeometry/useChildrenBoundsContract';
import { toVmin } from '@/lib/wave4LayoutResolver';
import { useCardOverlap } from '@/lib/geometryLab/cardArtifactOverlap';


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
   * Task C1 polish — number of incoming crib cards currently in flight
   * from a discard-to-crib transport animation. The crib pile renders
   * `max(0, crib.length - withheldCribIncomingCount)` cardbacks so the
   * pile does not visually grow before the flight lands. Cleared to 0
   * once the animation settles.
   */
  withheldCribIncomingCount?: number;
}

export function CribbageAnchoredCribCutMount({
  cribbageState,
  cardBackColors,
  handBoundaryKey,
  terminalPath = null,
  countingOutroActive = false,
  withheldCribIncomingCount = 0,
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


  const cribRef = useRef<HTMLDivElement | null>(null);
  const cutRef = useRef<HTMLDivElement | null>(null);

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

  if (!visible) {
    // Task C1 — even when no crib pile / cut card is visible (e.g. during
    // the `discarding` phase before any cards have been submitted), mount
    // an empty slot so [data-card-anchor="crib"] resolves for the
    // discard-to-crib transport animation. Rendering the slot with no
    // children is visually a no-op — it is only a positioning anchor.
    return (
      <Wave4CribCutGroupSlot
        styleVars={{ ['--cribcut-gap' as string]: `${cribToCutGapPx}px` }}
      />
    );
  }

  return (
    <Wave4CribCutGroupSlot
      styleVars={{ ['--cribcut-gap' as string]: `${cribToCutGapPx}px` }}
    >

      {/* Crib pile — sized from stage height. */}
      {showCribOnFelt && cribbageState.crib.length > 0 && (
        <div ref={cribRef} className="flex flex-col items-center">
          <span
            className="text-white/60 leading-none"
            style={{
              fontSize: `${Math.max(7, Math.round(cribCardWidthPx * 0.4))}px`,
              marginBottom: '2px',
            }}
          >
            Crib
          </span>
          <div
            className="flex"
            style={{ marginRight: `${cribCardOverlapPx}px` }}
          >
            {cribbageState.crib.map((_, i) => (
              <CanonicalCardBack
                key={i}
                widthPx={cribCardWidthPx}
                heightPx={cribCardHeightPx}
                variant="flat"
                radiusPx={2}
                style={{ marginLeft: i === 0 ? 0 : `-${cribCardOverlapPx}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cut card — artwork only, sized from stage height. */}
      <div ref={cutRef}>
        <CribbageCutCardReveal
          card={cribbageState.cutCard}
          cardBackColors={cardBackColors}
          handBoundaryKey={handBoundaryKey}
          widthPx={cutCardWidthPx}
        />
      </div>
    </Wave4CribCutGroupSlot>
  );
}

export default CribbageAnchoredCribCutMount;
