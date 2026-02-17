// Gin Rummy Match Winner Celebration Overlay

import { useEffect, useState } from 'react';
import type { GinRummyState } from '@/lib/ginRummyTypes';

interface GinRummyMatchWinnerProps {
  ginState: GinRummyState;
  getPlayerUsername: (playerId: string) => string;
}

export const GinRummyMatchWinner = ({ ginState, getPlayerUsername }: GinRummyMatchWinnerProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ginState.winnerPlayerId) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    }
  }, [ginState.winnerPlayerId]);

  if (!ginState.winnerPlayerId || !visible) return null;

  const winnerId = ginState.winnerPlayerId;
  const loserId = winnerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
  const winnerScore = ginState.matchScores[winnerId] || 0;
  const loserScore = ginState.matchScores[loserId] || 0;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none animate-in fade-in duration-500">
      <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 max-w-[85%] border-2 border-poker-gold shadow-[0_0_40px_rgba(218,165,32,0.4)] text-center pointer-events-auto">
        <p className="text-3xl mb-2">🏆</p>
        <h2 className="text-xl font-bold text-poker-gold mb-1">
          {getPlayerUsername(winnerId)} Wins!
        </h2>
        <p className="text-white/70 text-sm mb-3">
          {winnerScore} — {loserScore}
        </p>
        <p className="text-[10px] text-white/40">
          Match to {ginState.pointsToWin} points
        </p>
      </div>
    </div>
  );
};
