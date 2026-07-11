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

import { useEffect, useRef } from 'react';
import type { CribbageState } from '@/lib/cribbageTypes';
import { Wave4PeggingRowSlot } from './Wave4PeggingRowSlot';
import { recordCribbageWartime } from '@/lib/cribbage/cribbageWartimeLedger';

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
  /**
   * Unified presentation-gate override. When the parent is holding the
   * previous sequence visible (Go / 31), it passes the snapshot count
   * that belongs to the held sequence so the visible count and the
   * visible row cards derive from the SAME sequence. When null/undefined,
   * the mount falls back to authoritative `pegging.currentCount`.
   */
  displayCountOverride?: number | null;
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
  displayCountOverride = null,
}: CribbageAnchoredPeggingRowMountProps) {
  const phaseForLayout = countingOutroActive ? 'pegging' : cribbageState.phase;
  // Unified count source: when the parent is holding the previous
  // sequence visible, it supplies `displayCountOverride` derived from
  // the same held slice as the row. This is the ONLY way the count
  // reads during a hold — never from live `pegging.currentCount`,
  // which has already moved on to the next sequence.
  const displayCount =
    displayCountOverride != null
      ? displayCountOverride
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
        .slice(sequenceStartIndex, sequenceEndIndex ?? cribbageState.pegging.playedCards.length)
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
