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

  const endIdx = sequenceEndIndex ?? cribbageState.pegging.playedCards.length;
  const rowCards = cribbageState.pegging.playedCards
    .slice(sequenceStartIndex, endIdx)
    .filter((pc) => {
      if (!withheldPlayedCardKey) return true;
      const key = `${pc.playerId}|${pc.card.rank}${pc.card.suit[0]}`;
      return key !== withheldPlayedCardKey;
    })
    .map((pc, i) => ({ card: pc.card, playerId: pc.playerId, logicalIndex: i }));

  return (
    <>
      <PeggingRowRenderProbe
        sequenceStartIndex={sequenceStartIndex}
        sequenceEndIndex={endIdx}
        cards={rowCards}
        displayCount={displayCount}
        activePlayerId={cribbageState.pegging.currentTurnPlayerId ?? null}
        withheldPlayedCardKey={withheldPlayedCardKey}
      />
      <Wave4PeggingRowSlot
        phase="pegging"
        viewerSeatPosition={viewerSeatPosition}
        opponentSeatPositions={opponentSeatPositions}
        cutCardRevealed={cutCardRevealed}
        cribVisible={cribVisible}
        count={displayCount}
        playedCards={rowCards.map((c) => ({ card: c.card, playerId: c.playerId }))}
        showEmptyPlaceholder={!isPeggingWin}
        activePlayerId={cribbageState.pegging.currentTurnPlayerId ?? null}
      />
    </>
  );
}

/**
 * Instrumentation-only probe. Emits pegging_row_render on every logical
 * change (dedupeKey over the card set) plus a coalesced rect sample once
 * DOM has mounted. Does NOT block gameplay or affect layout.
 */
function PeggingRowRenderProbe({
  sequenceStartIndex,
  sequenceEndIndex,
  cards,
  displayCount,
  activePlayerId,
  withheldPlayedCardKey,
}: {
  sequenceStartIndex: number;
  sequenceEndIndex: number;
  cards: ReadonlyArray<{ card: { rank: string; suit: string }; playerId: string; logicalIndex: number }>;
  displayCount: number;
  activePlayerId: string | null;
  withheldPlayedCardKey: string | null;
}) {
  const sig = cards.map((c) => `${c.playerId}:${c.card.rank}${c.card.suit[0]}`).join(',');
  const lastSigRef = useRef<string | null>(null);
  const lastLogicalCountRef = useRef<number>(0);
  const lastDomCountRef = useRef<number>(0);

  useEffect(() => {
    if (lastSigRef.current === sig) return;
    const prevSig = lastSigRef.current;
    const prevLogicalCount = lastLogicalCountRef.current;
    lastSigRef.current = sig;
    lastLogicalCountRef.current = cards.length;

    // Row-clear logical trigger: transition from N>0 → 0 cards.
    const isRowClearRequested = prevLogicalCount > 0 && cards.length === 0;
    if (isRowClearRequested) {
      recordCribbageWartime('boundary', 'row_clear_requested', {
        prevLogicalCount,
        newLogicalCount: 0,
        sequenceStartIndex,
        sequenceEndIndex,
        activePlayerId,
        withheldPlayedCardKey,
      }, {
        producerComponent: 'CribbageAnchoredPeggingRowMount',
        producerFunction: 'PeggingRowRenderProbe.rowClearRequested',
        dedupeKey: `row_clear_req:${sequenceStartIndex}`,
        eventReason: 'logical row emptied',
      });
    }

    recordCribbageWartime('pegging', 'pegging_row_render', {
      sequenceStartIndex,
      sequenceEndIndex,
      logicalOrder: cards.map((c) => ({
        logicalIndex: c.logicalIndex,
        cardId: `${c.card.rank}${c.card.suit[0]}`,
        owner: c.playerId,
      })),
      displayCount,
      activePlayerId,
      withheldPlayedCardKey,
      prevLogicalCount,
    }, {
      producerComponent: 'CribbageAnchoredPeggingRowMount',
      producerFunction: 'PeggingRowRenderProbe.render',
      dedupeKey: `row:${sequenceStartIndex}:${sig}`,
      eventReason: prevSig == null ? 'first render' : 'row card set changed',
    });

    // Rect sample after paint. Coalesced: one sample per render change.
    const raf = requestAnimationFrame(() => {
      try {
        const domCards = Array.from(document.querySelectorAll('[data-pegging-row-card]')) as HTMLElement[];
        const rects = domCards.map((el, domIdx) => {
          const r = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          return {
            domIdx,
            cardId: el.getAttribute('data-card-id'),
            owner: el.getAttribute('data-player-id'),
            rect: { left: r.left, right: r.right, width: r.width },
            style: {
              left: cs.left, marginLeft: cs.marginLeft,
              transform: cs.transform, zIndex: cs.zIndex, position: cs.position,
            },
          };
        });
        const steps: number[] = [];
        for (let i = 1; i < rects.length; i++) {
          steps.push(rects[i].rect.left - rects[i - 1].rect.left);
        }
        const nonUniform = steps.length > 1 && steps.some((s) => Math.abs(s - steps[0]) > 1);
        const contradictions: string[] = [];
        if (nonUniform) contradictions.push('nonUniformPeggingStep');
        if (rects.length !== cards.length) contradictions.push('DOM_logical_count_mismatch');
        recordCribbageWartime('pegging', 'pegging_row_card_rect_sample', {
          domCount: rects.length,
          logicalCount: cards.length,
          rects,
          steps,
          expectedConstantStep: steps[0] ?? null,
        }, {
          producerComponent: 'CribbageAnchoredPeggingRowMount',
          producerFunction: 'PeggingRowRenderProbe.rectSample',
          dedupeKey: `rowRect:${sequenceStartIndex}:${sig}`,
          contradictions,
        });

        // D-group: DOM row-clear boundary detection.
        const prevDom = lastDomCountRef.current;
        lastDomCountRef.current = rects.length;
        if (prevDom > 0 && rects.length < prevDom && cards.length < prevLogicalCount) {
          recordCribbageWartime('boundary', 'row_clear_dom_started', {
            prevDomCount: prevDom,
            newDomCount: rects.length,
            logicalCount: cards.length,
            sequenceStartIndex,
            sequenceEndIndex,
          }, {
            producerComponent: 'CribbageAnchoredPeggingRowMount',
            producerFunction: 'PeggingRowRenderProbe.rowClearDomStarted',
            dedupeKey: `row_clear_dom_start:${sequenceStartIndex}:${prevDom}->${rects.length}`,
            eventReason: 'DOM row count decreased after logical clear',
          });
        }
        if (prevDom > 0 && rects.length === 0) {
          recordCribbageWartime('boundary', 'row_clear_dom_complete', {
            prevDomCount: prevDom,
            logicalCount: cards.length,
            sequenceStartIndex,
            sequenceEndIndex,
          }, {
            producerComponent: 'CribbageAnchoredPeggingRowMount',
            producerFunction: 'PeggingRowRenderProbe.rowClearDomComplete',
            dedupeKey: `row_clear_dom_complete:${sequenceStartIndex}`,
            eventReason: 'DOM row fully cleared',
          });
        }
      } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [sig, sequenceStartIndex, sequenceEndIndex, displayCount, activePlayerId, withheldPlayedCardKey, cards]);

  return null;
}



export default CribbageAnchoredPeggingRowMount;
