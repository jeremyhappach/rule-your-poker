import { useEffect, useRef } from 'react';
import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';
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
  // Detect pegging win: phase is 'complete' but lastHandCount is null
  // (meaning we never entered counting phase - win occurred during pegging)
  const isPeggingWin = phaseForLayout === 'complete' && !cribbageState.lastHandCount;

  // Hide standard felt content during counting phase (CribbageCountingPhase takes over)
  // Use the actual phase from state, not the presence of countingScoreOverrides.
  // During win sequences where DB phase may already be 'complete', we check lastHandCount
  // to distinguish counting wins from pegging wins.
  // Exception: pegging wins should NOT enter counting layout - cards stay visible on felt.
  const isCountingPhase = (
    phaseForLayout === 'counting' ||
    (phaseForLayout === 'complete' && !!cribbageState.lastHandCount)
  ) && !isPeggingWin;

  // Show crib on felt only during discarding/cutting/pegging (or pegging win)
  const showCribOnFelt =
    cribbageState.crib.length > 0 &&
    !isCountingPhase &&
    (phaseForLayout !== 'complete' || isPeggingWin);

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
        {/* Skunk indicator when active */}
        {cribbageState.payoutMultiplier > 1 && (
          <div className="absolute top-2 right-2 z-30">
            <div className="bg-destructive px-2 py-1 rounded">
              <p className="text-xs font-bold text-destructive-foreground">
                {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE!'}
              </p>
            </div>
          </div>
        )}

        {/* Peg Board now rendered by parent (CribbageMobileGameTable) for mount stability */}
      </>
    );
  }

  return (
    <>
      {/* Game title moved to CribbageMobileGameTable */}

      {/* Skunk indicator when active */}
      {cribbageState.payoutMultiplier > 1 && (
        <div className="absolute top-2 right-2 z-30">
          <div className="bg-destructive px-2 py-1 rounded">
            <p className="text-xs font-bold text-destructive-foreground">
              {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE!'}
            </p>
          </div>
        </div>
      )}

      {/* Peg Board now rendered by parent (CribbageMobileGameTable) for mount stability */}

      {/* Crib and Cut Card row - hidden during counting layout (CribbageCountingPhase shows its own) */}
      {(showCribOnFelt || cribbageState.cutCard) && !isCountingPhase && (
        <div className="absolute top-[24%] left-1/2 -translate-x-1/2 z-30 flex items-start gap-4">
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

      {/* Pegging / Gameplay Area - positioned below peg board but above dealer button */}
      {/* Show during pegging OR during pegging win (to keep cards visible during win animation) */}
      {(phaseForLayout === 'pegging' || isPeggingWin) && (
        <div className="absolute top-[68%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          {/* Count on the left - hide during pegging win (game is over) */}
          {phaseForLayout === 'pegging' && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-white/60">Count</span>
              <span className="text-2xl font-bold text-poker-gold">{displayCount}</span>
            </div>
          )}
          {/* Played cards - larger size, overlapping */}
          {/* For pegging wins, show ALL played cards (not just current sequence) */}
          <div className="flex -space-x-4 justify-center">
            {(isPeggingWin
              ? cribbageState.pegging.playedCards
              : cribbageState.pegging.playedCards.slice(sequenceStartIndex)
            ).map((pc, i) => (
              <CribbagePlayingCard key={i} card={pc.card} size="md" />
            ))}
            {cribbageState.pegging.playedCards.slice(sequenceStartIndex).length === 0 && !isPeggingWin && (
              <div className="w-10 h-[60px] border border-dashed border-white/20 rounded" />
            )}
          </div>
        </div>
      )}
    </>
  );
};
