/**
 * Wave 5D — PeggingRow Graduation (mount placement).
 *
 * Mounts Wave4PeggingRowSlot OUTSIDE the `translateY(6%)` felt-content
 * wrapper in CribbageMobileGameTable, as a sibling of the pegboard and
 * cribCutGroup mounts. See WAVE 5 INVARIANT in Wave4CribCutGroupSlot.
 *
 * Gating mirrors the previous render site inside CribbageFeltContent:
 *   - hidden during counting phase / counting terminal paths
 *   - visible while pegging
 *   - visible during a pegging-win terminal snapshot
 */

import type { CribbageState } from '@/lib/cribbageTypes';
import { Wave4PeggingRowSlot } from './Wave4PeggingRowSlot';

export interface CribbageAnchoredPeggingRowMountProps {
  cribbageState: CribbageState;
  sequenceStartIndex: number;
  countingOutroActive?: boolean;
  thirtyOneDelayActive?: boolean;
  terminalPath?:
    | 'pegging'
    | 'counting'
    | 'hand-counting'
    | 'crib-counting'
    | 'fallback'
    | null;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  /**
   * Task C2 — withhold a single played card from the rendered row while
   * its transport overlay is in flight. Key format: `${playerId}|${rank}${suit}`.
   * Cleared by the parent once the flight settles.
   */
  withheldPlayedCardKey?: string | null;
}

export function CribbageAnchoredPeggingRowMount({
  cribbageState,
  sequenceStartIndex,
  countingOutroActive = false,
  thirtyOneDelayActive = false,
  terminalPath = null,
  viewerSeatPosition,
  opponentSeatPositions,
  cutCardRevealed,
  cribVisible,
  withheldPlayedCardKey = null,
}: CribbageAnchoredPeggingRowMountProps) {
  const phaseForLayout = countingOutroActive ? 'pegging' : cribbageState.phase;
  const displayCount = thirtyOneDelayActive
    ? 31
    : cribbageState.pegging.currentCount;

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

  if (isCountingPhase) return null;
  if (!(phaseForLayout === 'pegging' || isPeggingWin)) return null;

  return (
    <Wave4PeggingRowSlot
      phase="pegging"
      viewerSeatPosition={viewerSeatPosition}
      opponentSeatPositions={opponentSeatPositions}
      cutCardRevealed={cutCardRevealed}
      cribVisible={cribVisible}
      count={displayCount}
      playedCards={cribbageState.pegging.playedCards
        .slice(sequenceStartIndex)
        .map((pc) => ({ card: pc.card, playerId: pc.playerId }))}
      showEmptyPlaceholder={!isPeggingWin}
      activePlayerId={cribbageState.pegging.currentTurnPlayerId ?? null}
    />
  );
}


export default CribbageAnchoredPeggingRowMount;
