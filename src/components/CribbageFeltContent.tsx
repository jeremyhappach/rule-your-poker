import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { cn } from '@/lib/utils';
import { getPhaseDisplayName } from '@/lib/cribbageGameLogic';

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
}

export const CribbageFeltContent = ({
  cribbageState,
  players,
  currentPlayerId,
  sequenceStartIndex,
  getPlayerUsername,
}: CribbageFeltContentProps) => {
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;

  return (
    <>
      {/* Phase indicator - top left */}
      <div className="absolute top-2 left-2 z-20">
        <div className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          <p className="text-sm font-medium text-amber-200">
            {getPhaseDisplayName(cribbageState.phase)}
          </p>
        </div>
      </div>

      {/* Skunk/Double Skunk indicator - top right */}
      {cribbageState.payoutMultiplier > 1 && (
        <div className="absolute top-2 right-2 z-20">
          <div className="bg-red-600 px-3 py-1.5 rounded-lg">
            <p className="text-sm font-bold text-white">
              {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE SKUNK!'}
            </p>
          </div>
        </div>
      )}

      {/* Peg Board - positioned in upper portion of felt */}
      <div className="absolute top-12 left-4 right-4 z-10">
        <CribbagePegBoard 
          players={players}
          playerStates={cribbageState.playerStates}
          winningScore={121}
        />
      </div>

      {/* Center Play Area - Cut Card and Pegging Cards */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-20">
        {/* Cut Card */}
        {cribbageState.cutCard && (
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-white/60 mb-0.5">Cut</span>
            <CribbagePlayingCard card={cribbageState.cutCard} size="sm" />
          </div>
        )}

        {/* Pegging Area */}
        {cribbageState.phase === 'pegging' && (
          <div className="bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="flex items-center justify-between mb-2 min-w-[160px]">
              <span className="text-xs text-white/60">Count</span>
              <span className="text-2xl font-bold text-poker-gold">
                {cribbageState.pegging.currentCount}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 justify-center min-h-[52px]">
              {cribbageState.pegging.playedCards.slice(sequenceStartIndex).map((pc, i) => (
                <div key={i} className="relative">
                  <CribbagePlayingCard card={pc.card} size="sm" />
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/70 whitespace-nowrap">
                    {getPlayerUsername(pc.playerId).slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Turn Indicator */}
        {cribbageState.phase === 'pegging' && cribbageState.pegging.currentTurnPlayerId && (
          <p className="text-sm mt-2">
            {isMyTurn ? (
              <span className="text-poker-gold font-bold animate-pulse">Your turn!</span>
            ) : (
              <span className="text-white/70">
                Waiting for {getPlayerUsername(cribbageState.pegging.currentTurnPlayerId)}
              </span>
            )}
          </p>
        )}
      </div>
    </>
  );
};
