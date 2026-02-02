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
  cardBackColors: { color: string; darkColor: string };
}

export const CribbageFeltContent = ({
  cribbageState,
  players,
  currentPlayerId,
  sequenceStartIndex,
  getPlayerUsername,
  cardBackColors,
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
      <div className="absolute top-[52%] left-6 right-6 -translate-y-1/2 z-10">
        <CribbagePegBoard 
          players={players}
          playerStates={cribbageState.playerStates}
          winningScore={CRIBBAGE_WINNING_SCORE}
        />
      </div>

      {/* Crib - shows actual card count as horizontal row like opponent cards */}
      {showCribOnFelt && cribbageState.crib.length > 0 && (
        <div className="absolute top-[24%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
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

      {/* Pegging / Gameplay Area - positioned below peg board but above dealer button */}
      {cribbageState.phase === 'pegging' && (
        <div className="absolute top-[68%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          {/* Count on the left */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-white/60">Count</span>
            <span className="text-2xl font-bold text-poker-gold">{cribbageState.pegging.currentCount}</span>
          </div>
          {/* Played cards - larger size, overlapping */}
          <div className="flex -space-x-4 justify-center">
            {cribbageState.pegging.playedCards.slice(sequenceStartIndex).map((pc, i) => (
              <CribbagePlayingCard key={i} card={pc.card} size="md" />
            ))}
            {cribbageState.pegging.playedCards.slice(sequenceStartIndex).length === 0 && (
              <div className="w-10 h-[60px] border border-dashed border-white/20 rounded" />
            )}
          </div>
        </div>
      )}

      {/* Cut Card */}
      {cribbageState.cutCard && (
        <div className="absolute top-[24%] left-1/2 -translate-x-1/2 translate-x-12 z-20 flex flex-col items-center">
          <span className="text-[9px] text-white/60 mb-0.5">Cut</span>
          <CribbagePlayingCard card={cribbageState.cutCard} size="sm" />
        </div>
      )}
    </>
  );
};
