/**
 * Wave 5D — CribCutGroup Graduation (mount placement).
 *
 * This component exists for one reason: to mount the anchored
 * cribCutGroup slot OUTSIDE the `transform: translateY(6%)` felt-content
 * wrapper in CribbageMobileGameTable.
 *
 * See WAVE 5 INVARIANT in `src/components/Wave4CribCutGroupSlot.tsx`:
 *   "Anchored artifacts MUST NOT mount beneath transformed ancestors."
 *
 * The crib pile + cut card JSX previously lived inside CribbageFeltContent,
 * which itself sits inside the translateY(6%) wrapper. That ancestor
 * transform silently shifted the rendered DOM rect down by ~6% of the
 * felt-frame height, breaking the contract:
 *
 *   renderedBounds.centerY  ≡  assignedRect.centerY
 *
 * By mounting the slot as a sibling of the wrapper (mirroring the
 * Pegboard Graduation pattern), the rendered DOM rect equals the assigned
 * anchored rect exactly. The gating logic (showCrib / isCountingPhase /
 * isPeggingWin / etc.) is reproduced here verbatim from CribbageFeltContent
 * so the visual behavior is identical.
 */

import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';
import { Wave4CribCutGroupSlot } from './Wave4CribCutGroupSlot';

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
}

export function CribbageAnchoredCribCutMount({
  cribbageState,
  cardBackColors,
  handBoundaryKey,
  terminalPath = null,
  countingOutroActive = false,
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

  if (!(showCribOnFelt || cribbageState.cutCard) || isCountingPhase || isPeggingWin) {
    return null;
  }

  return (
    <Wave4CribCutGroupSlot>
      {/* Crib */}
      {showCribOnFelt && cribbageState.crib.length > 0 && (
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-white/60 mb-0.5">Crib</span>
          <div className="flex -space-x-1.5">
            {cribbageState.crib.map((_, i) => (
              <div
                key={i}
                className="w-4 h-6 rounded-sm border border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cut Card with flip animation */}
      <CribbageCutCardReveal
        card={cribbageState.cutCard}
        cardBackColors={cardBackColors}
        handBoundaryKey={handBoundaryKey}
      />
    </Wave4CribCutGroupSlot>
  );
}

export default CribbageAnchoredCribCutMount;
