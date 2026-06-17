import { useEffect, useRef } from 'react';
import type { CribbageState } from '@/lib/cribbageTypes';
// CribbagePegBoard now rendered by parent for mount stability
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';
import { Wave4PeggingRowSlot } from './Wave4PeggingRowSlot';
import { Wave4CribCutGroupSlot } from './Wave4CribCutGroupSlot';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { buildMetaPayload } from '@/lib/buildMeta';

interface Player {
  id: string;
  user_id: string;
  position: number;
  profiles?: { username: string };
}

interface CribbageFeltContentProps {
  cribbageState: CribbageState;
  players: Player[];
  currentPlayerId: string | undefined;
  sequenceStartIndex: number;
  getPlayerUsername: (playerId: string) => string;
  cardBackColors: { color: string; darkColor: string };
  countingScoreOverrides?: Record<string, number>;
  /** When true, treat the brief counting-delay window as pegging so the last pegged cards remain visible. */
  countingOutroActive?: boolean;
  /** When true, we're in the 31 delay - show count as 31 and keep cards visible */
  thirtyOneDelayActive?: boolean;
  /** Stable key that changes on hand boundaries — passed to CribbageCutCardReveal to prevent re-flip */
  handBoundaryKey?: string;
  /** Explicit terminal-path tag set by the parent when a win sequence fires.
   *  Authoritative source for picking the complete-phase card layout. When null,
   *  legacy heuristic (`!lastHandCount` ⇒ pegging) is used as a safe fallback. */
  terminalPath?: 'pegging' | 'counting' | 'hand-counting' | 'crib-counting' | 'fallback' | null;
  /** Wave 5B — descriptor inputs forwarded to Wave4PeggingRowSlot.
   *  Optional with safe defaults so existing call sites continue to
   *  compile; CribbageMobileGameTable supplies the real values to
   *  keep resolver inputs consistent with Wave4PegboardSlot. */
  viewerSeatPosition?: number | null;
  opponentSeatPositions?: ReadonlyArray<number>;
  cutCardRevealed?: boolean;
  cribVisible?: boolean;
}

export const CribbageFeltContent = ({
  cribbageState,
  players,
  currentPlayerId,
  sequenceStartIndex,
  getPlayerUsername,
  cardBackColors,
  countingScoreOverrides,
  countingOutroActive = false,
  thirtyOneDelayActive = false,
  handBoundaryKey,
  terminalPath = null,
  viewerSeatPosition = null,
  opponentSeatPositions = [],
  cutCardRevealed = true,
  cribVisible = true,
}: CribbageFeltContentProps) => {
  // ── Lifecycle instrumentation ──
  const feltInstanceIdRef = useRef<string>(`felt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const feltRenderCountRef = useRef(0);
  feltRenderCountRef.current += 1;

  useEffect(() => {
    logDebugEvent({
      gameId: 'felt-lifecycle',
      eventType: 'crib:lifecycle:felt_mounted',
      payload: {
        instanceId: feltInstanceIdRef.current,
        phase: cribbageState.phase,
        handBoundaryKey: handBoundaryKey ?? null,
        hasCutCard: !!cribbageState.cutCard,
        cribSize: cribbageState.crib.length,
        playedCards: cribbageState.pegging?.playedCards?.length ?? 0,
        countingOutroActive,
        thirtyOneDelayActive,
        hasCountingOverrides: !!countingScoreOverrides,
        // Bootstrap contamination detection
        playerHandSizes: Object.fromEntries(
          Object.entries(cribbageState.playerStates).map(([id, ps]) => [id.slice(0, 8), ps.hand?.length ?? 0])
        ),
        pegScores: Object.fromEntries(
          Object.entries(cribbageState.playerStates).map(([id, ps]) => [id.slice(0, 8), ps.pegScore ?? 0])
        ),
        ...buildMetaPayload(),
      },
    });
    return () => {
      logDebugEvent({
        gameId: 'felt-lifecycle',
        eventType: 'crib:lifecycle:felt_unmounted',
        payload: {
          instanceId: feltInstanceIdRef.current,
          handBoundaryKey: handBoundaryKey ?? null,
          renderCount: feltRenderCountRef.current,
        },
      });
    };
  }, []); // true mount/unmount only

  // Log identity/key changes across renders
  const prevHandBoundaryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevHandBoundaryKeyRef.current !== null && prevHandBoundaryKeyRef.current !== (handBoundaryKey ?? null)) {
      logDebugEvent({
        gameId: 'felt-lifecycle',
        eventType: 'crib:lifecycle:felt_key_changed',
        payload: {
          instanceId: feltInstanceIdRef.current,
          prevHandBoundaryKey: prevHandBoundaryKeyRef.current,
          newHandBoundaryKey: handBoundaryKey ?? null,
          phase: cribbageState.phase,
          renderCount: feltRenderCountRef.current,
        },
      });
    }
    prevHandBoundaryKeyRef.current = handBoundaryKey ?? null;
  }, [handBoundaryKey]);
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;

  // During the 2s outro OR 31 delay, keep the pegging layout visible even though DB phase/count may be updated.
  const phaseForLayout = countingOutroActive ? 'pegging' : cribbageState.phase;
  
  // During 31 delay, show 31 as the count instead of the reset 0
  const displayCount = thirtyOneDelayActive ? 31 : cribbageState.pegging.currentCount;
  // Terminal-path classification (set by parent at win-trigger time).
  // Authoritative when present; legacy `!lastHandCount` heuristic is used only
  // as a fallback when no path tag is available (e.g. for non-terminal renders
  // or states that reached `complete` outside a win sequence).
  const isCountingTerminalPath =
    terminalPath === 'counting' ||
    terminalPath === 'hand-counting' ||
    terminalPath === 'crib-counting';

  // Pegging win = parent stamped 'pegging', OR (no tag yet) legacy heuristic.
  // 'fallback' explicitly does NOT count as pegging — it should suppress the
  // pegging row instead of falling through to the 8-card aggregate layout.
  const isPeggingWin = phaseForLayout === 'complete' && (
    terminalPath === 'pegging' ||
    (terminalPath === null && !cribbageState.lastHandCount)
  );

  // Hide standard felt content during counting phase (CribbageCountingPhase takes over).
  // Now also true for any counting terminal-path (incl. reactive combo-crossing
  // where lastHandCount has not yet been persisted) and for the fallback path.
  const isCountingPhase = (
    phaseForLayout === 'counting' ||
    (phaseForLayout === 'complete' && !!cribbageState.lastHandCount) ||
    (phaseForLayout === 'complete' && isCountingTerminalPath) ||
    (phaseForLayout === 'complete' && terminalPath === 'fallback')
  ) && !isPeggingWin;

  // Show crib on felt only during discarding/cutting/pegging.
  // ROOT-CAUSE FIX (pegging-win regression): a pegging win is the terminal
  // snapshot of the *pegging* state at win determination — not the dealer's
  // hand-counting layout. Suppress crib + cut card during a pegging win so
  // only the in-progress sequence stays visible.
  const showCribOnFelt =
    cribbageState.crib.length > 0 &&
    !isCountingPhase &&
    !isPeggingWin &&
    phaseForLayout !== 'complete';

  // [TERMINAL-CARD-CONTEXT AUDIT] Whenever the felt is in a terminal/complete
  // phase, log exactly which render branch is chosen and what card data is
  // backing it. Investigating: counting-path win rendering an 8-card pegging
  // row instead of the frozen counting hand+combo.
  if (phaseForLayout === 'complete') {
    logDebugEvent({
      gameId: 'terminal-card-context',
      eventType: 'crib:terminal:felt_render_decision',
      payload: {
        feltInstanceId: feltInstanceIdRef.current,
        phase: cribbageState.phase,
        phaseForLayout,
        winnerPlayerId: cribbageState.winnerPlayerId?.slice(0, 8) ?? null,
        payoutMultiplier: cribbageState.payoutMultiplier ?? 1,
        terminalPath,
        hasLastHandCount: !!cribbageState.lastHandCount,
        isPeggingWin,
        isCountingPhase,
        showCribOnFelt,
        playedCardsCount: cribbageState.pegging.playedCards.length,
        playedCards: cribbageState.pegging.playedCards.map(pc => `${pc.card.rank}${pc.card.suit[0]}`),
        sequenceStartIndex,
        cribSize: cribbageState.crib.length,
        cutCard: cribbageState.cutCard ? `${cribbageState.cutCard.rank}${cribbageState.cutCard.suit[0]}` : null,
        renderBranch: isCountingPhase
          ? 'counting (CribbageCountingPhase owns cards)'
          : isPeggingWin
            ? 'pegging-win (renders ALL playedCards on felt)'
            : 'default-complete (no card row)',
        ...buildMetaPayload(),
      },
    });
  }

  // During counting, show pegboard and skunk indicator - cards handled by CribbageCountingPhase
  if (isCountingPhase) {
    // Log score sources during counting for regression investigation
    logDebugEvent({
      gameId: 'pegboard-source',
      eventType: 'crib:pegboard:counting_render',
      payload: {
        feltInstanceId: feltInstanceIdRef.current,
        phase: cribbageState.phase,
        phaseForLayout,
        hasCountingOverrides: !!countingScoreOverrides,
        overrideScores: countingScoreOverrides
          ? Object.fromEntries(Object.entries(countingScoreOverrides).map(([id, s]) => [id.slice(0, 8), s]))
          : null,
        rawPegScores: Object.fromEntries(
          Object.entries(cribbageState.playerStates).map(([id, ps]) => [id.slice(0, 8), ps.pegScore ?? 0])
        ),
      },
    });
    return (
      <>
        {/* Skunk/Double badge removed — centered overlay + rail announcement
            already communicate the payout multiplier. */}


        {/* Peg Board now rendered by parent (CribbageMobileGameTable) for mount stability */}
      </>
    );
  }

  return (
    <>
      {/* Game title moved to CribbageMobileGameTable */}

      {/* Skunk/Double badge removed — centered overlay + rail announcement
          already communicate the payout multiplier. */}


      {/* Peg Board now rendered by parent (CribbageMobileGameTable) for mount stability */}

      {/* Crib and Cut Card row - hidden during counting layout (CribbageCountingPhase shows its own)
          and hidden during pegging-win so the felt shows the pegging snapshot at win determination. */}
      {(showCribOnFelt || cribbageState.cutCard) && !isCountingPhase && !isPeggingWin && (
        <div className="absolute top-[17%] left-1/2 -translate-x-1/2 z-30 flex items-start gap-4">
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
        </div>
      )}



      {/* Pegging / Gameplay Area — Wave 5B
          Geometry ownership: cribbage.peggingRow descriptor → resolver
          → Wave4PeggingRowSlot → rect. The previous
          `absolute top-[68%] left-1/2 -translate-x-1/2` CSS percentage
          no longer owns position. The slot's internal flex
          (alignItems:center, justifyContent:center, gap) reproduces
          the previous row layout — card sizes, overlap (-space-x-4)
          and the count column are untouched. */}
      {(phaseForLayout === 'pegging' || isPeggingWin) && (
        <Wave4PeggingRowSlot
          phase="pegging"
          viewerSeatPosition={viewerSeatPosition}
          opponentSeatPositions={opponentSeatPositions}
          cutCardRevealed={cutCardRevealed}
          cribVisible={cribVisible}
          count={displayCount}
          playedCards={cribbageState.pegging.playedCards
            .slice(sequenceStartIndex)
            .map((pc) => ({ card: pc.card }))}
          showEmptyPlaceholder={!isPeggingWin}
        />
      )}
    </>
  );
};
