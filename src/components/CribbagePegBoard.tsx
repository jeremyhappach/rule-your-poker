import type { CribbagePlayerState } from '@/lib/cribbageTypes';

interface Player {
  id: string;
  profiles?: { username: string };
}

interface CribbagePegBoardProps {
  players: Player[];
  playerStates: Record<string, CribbagePlayerState>;
  winningScore: number;
}

const PLAYER_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
];

export const CribbagePegBoard = ({
  players,
  playerStates,
  winningScore,
}: CribbagePegBoardProps) => {
  const getPlayerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length];
  
  return (
    <div className="space-y-1.5">
      {/* Progress bars for each player */}
      {players.map((player, index) => {
        const state = playerStates[player.id];
        const score = state?.pegScore || 0;
        const percentage = Math.min(100, (score / winningScore) * 100);
        
        return (
          <div key={player.id} className="flex items-center gap-2">
            <span className="text-[10px] text-white/80 w-14 truncate">
              {player.profiles?.username || 'Player'}
            </span>
            
            <div className="flex-1 h-3 bg-black/40 rounded-full overflow-hidden relative">
              {/* Progress */}
              <div 
                className={`h-full ${getPlayerColor(index)} transition-all duration-500 rounded-full`}
                style={{ width: `${percentage}%` }}
              />
              
              {/* Peg marker */}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${getPlayerColor(index)} border border-white shadow transition-all duration-500`}
                style={{ left: `calc(${percentage}% - 5px)` }}
              />
            </div>
            
            <span className="text-xs font-bold text-poker-gold w-8 text-right">
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
};
