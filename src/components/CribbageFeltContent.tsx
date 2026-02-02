import type { CribbageState } from '@/lib/cribbageTypes';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CRIBBAGE_WINNING_SCORE } from '@/lib/cribbageTypes';

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
  const showCribOnFelt = cribbageState.crib.length > 0 && cribbageState.phase !== 'counting';

  return (
    <>
      {/* Game title moved to CribbageMobileGameTable */}

      {/* Skunk indicator when active */}
      {cribbageState.payoutMultiplier > 1 && (
        <div className="absolute top-2 right-2 z-30">
          <div className="bg-red-600 px-2 py-1 rounded">
            <p className="text-xs font-bold text-white">
              {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE!'}
            </p>
          </div>
        </div>
      )}

      {/* Peg Board - Center area */}
      <div className="absolute top-[38%] left-6 right-6 -translate-y-1/2 z-10">
        <CribbagePegBoard 
          players={players}
          playerStates={cribbageState.playerStates}
          winningScore={CRIBBAGE_WINNING_SCORE}
        />
      </div>

      {/* Crib - centered above the pegging/play area */}
      {showCribOnFelt && (
        <div className="absolute top-[49%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
          <span className="text-[9px] text-white/60 mb-0.5">Crib</span>
          <div className="relative">
            {/* Stack effect */}
            <div className="absolute top-0.5 left-0.5 w-6 h-9 bg-slate-700 rounded border border-slate-600" />
            <div className="absolute top-1 left-1 w-6 h-9 bg-slate-700 rounded border border-slate-600" />
            <CribbagePlayingCard card={{ rank: 'A', suit: 'spades', value: 1 }} size="xs" faceDown />
          </div>
        </div>
      )}

      {/* Pegging / Gameplay Area (moved to where the Crib used to be) */}
      {cribbageState.phase === 'pegging' && (
        <div className="absolute top-[60%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] text-white/60">Count:</span>
            <span className="text-lg font-bold text-poker-gold">{cribbageState.pegging.currentCount}</span>
          </div>
          <div className="flex gap-0.5 justify-center min-w-[80px]">
            {cribbageState.pegging.playedCards.slice(sequenceStartIndex).map((pc, i) => (
              <div key={i} className="relative">
                <CribbagePlayingCard card={pc.card} size="xs" />
              </div>
            ))}
            {cribbageState.pegging.playedCards.slice(sequenceStartIndex).length === 0 && (
              <div className="w-8 h-12 border border-dashed border-white/20 rounded" />
            )}
          </div>
        </div>
      )}

      {/* Cut Card */}
      {cribbageState.cutCard && (
        <div className="absolute top-[57%] left-1/2 -translate-x-1/2 translate-x-12 z-20 flex flex-col items-center">
          <span className="text-[9px] text-white/60 mb-0.5">Cut</span>
          <CribbagePlayingCard card={cribbageState.cutCard} size="sm" />
        </div>
      )}

      {/* Turn Indicator */}
      {cribbageState.phase === 'pegging' && cribbageState.pegging.currentTurnPlayerId && (
        <div className="absolute top-[75%] left-1/2 -translate-x-1/2 z-20">
          <p className="text-xs">
            {isMyTurn ? (
              <span className="text-poker-gold font-bold animate-pulse">Your turn!</span>
            ) : (
              <span className="text-white/70">
                {getPlayerUsername(cribbageState.pegging.currentTurnPlayerId)}'s turn
              </span>
            )}
          </p>
        </div>
      )}
    </>
  );
};
