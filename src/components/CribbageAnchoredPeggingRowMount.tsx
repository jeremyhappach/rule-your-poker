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
  /**
   * Exclusive end index of the pegging-row slice. When the parent is
   * holding the previous row visible after a Go / 31, this is set to
   * the authoritative `pegging.sequenceStartIndex` so any cards played
   * into the *next* sequence do not render on top of the held row.
   * When omitted, defaults to `playedCards.length`.
   */
  sequenceEndIndex?: number;
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
  sequenceEndIndex,
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
  // Only force the display count to 31 when the sequence-end trigger is
  // an actual pegging_points count===31. `thirtyOneDelayActive` is also
  // raised for `go_point` events (to hold the row visible while the
  // last card's transport lands), but those award +1 at the current
  // running count — never 31 — so the visible counter must remain at
  // `pegging.currentCount` for the Go/last case.
  const lastEvent = cribbageState.lastEvent as
    | { type?: string; count?: number }
    | null
    | undefined;
  const isActual31Hold =
    thirtyOneDelayActive &&
    lastEvent?.type === 'pegging_points' &&
    lastEvent?.count === 31;
  const displayCount = isActual31Hold
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
        .filter((pc) => {
          if (!withheldPlayedCardKey) return true;
          const key = `${pc.playerId}|${pc.card.rank}${pc.card.suit[0]}`;
          return key !== withheldPlayedCardKey;
        })
        .map((pc) => ({ card: pc.card, playerId: pc.playerId }))}
      showEmptyPlaceholder={!isPeggingWin}
      activePlayerId={cribbageState.pegging.currentTurnPlayerId ?? null}
    />
  );
}


export default CribbageAnchoredPeggingRowMount;
