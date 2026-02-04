import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCutCardReveal } from './CribbageCutCardReveal';

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
}

export const CribbageFeltContent = ({
  cribbageState,
  players,
  currentPlayerId,
  sequenceStartIndex,
  getPlayerUsername,
  cardBackColors,
  countingScoreOverrides,
}: CribbageFeltContentProps) => {
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;
  
  // Detect pegging win: phase is 'complete' but lastHandCount is null
  // (meaning we never entered counting phase - win occurred during pegging)
  const isPeggingWin = cribbageState.phase === 'complete' && !cribbageState.lastHandCount;
  
  // Hide standard felt content during counting phase (CribbageCountingPhase takes over)
  // Also treat "countingScoreOverrides present" as counting layout so the UI doesn't snap back
  // to the normal cut-card row during win sequences where DB phase may already be 'complete'.
  // Exception: pegging wins should NOT enter counting layout - cards stay visible on felt.
  const isCountingPhase = (cribbageState.phase === 'counting' || !!countingScoreOverrides) && !isPeggingWin;
  
  // Show crib on felt only during discarding/cutting/pegging (or pegging win)
  const showCribOnFelt = cribbageState.crib.length > 0 && 
    !isCountingPhase && 
    (cribbageState.phase !== 'complete' || isPeggingWin);

  // During counting, show pegboard and skunk indicator - cards handled by CribbageCountingPhase
  if (isCountingPhase) {
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

        {/* Peg Board - stays in normal position during counting, uses animated scores */}
        <div className="absolute top-[52%] left-6 right-6 -translate-y-1/2 z-10">
          <CribbagePegBoard 
            players={players}
            playerStates={cribbageState.playerStates}
            winningScore={cribbageState.pointsToWin}
            overrideScores={countingScoreOverrides}
          />
        </div>
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

      {/* Peg Board - Center area */}
      <div className="absolute top-[52%] left-6 right-6 -translate-y-1/2 z-10">
        <CribbagePegBoard 
          players={players}
          playerStates={cribbageState.playerStates}
          winningScore={cribbageState.pointsToWin}
        />
      </div>

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
          />
        </div>
      )}

      {/* Pegging / Gameplay Area - positioned below peg board but above dealer button */}
      {/* Show during pegging OR during pegging win (to keep cards visible during win animation) */}
      {(cribbageState.phase === 'pegging' || isPeggingWin) && (
        <div className="absolute top-[68%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          {/* Count on the left - hide during pegging win (game is over) */}
          {cribbageState.phase === 'pegging' && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-white/60">Count</span>
              <span className="text-2xl font-bold text-poker-gold">{cribbageState.pegging.currentCount}</span>
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
