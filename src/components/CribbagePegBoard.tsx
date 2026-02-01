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
  // Create a simplified horizontal peg board
  // Real board has 120 holes in a winding pattern, we'll show a linear progress bar
  
  const getPlayerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length];
  
  return (
    <div className="bg-amber-900/50 rounded-lg p-3 border border-amber-700/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-amber-200">Peg Board</span>
        <span className="text-xs text-amber-200">{winningScore} to win</span>
      </div>
      
      {/* Progress bars for each player */}
      <div className="space-y-2">
        {players.map((player, index) => {
          const state = playerStates[player.id];
          const score = state?.pegScore || 0;
          const percentage = Math.min(100, (score / winningScore) * 100);
          
          return (
            <div key={player.id} className="flex items-center gap-2">
              <span className="text-xs text-amber-200 w-16 truncate">
                {player.profiles?.username || 'Player'}
              </span>
              
              <div className="flex-1 h-4 bg-black/30 rounded-full overflow-hidden relative">
                {/* Hole markers */}
                <div className="absolute inset-0 flex justify-between px-1">
                  {[30, 60, 90, 120].map(mark => (
                    <div 
                      key={mark}
                      className="w-px h-full bg-amber-700/50"
                      style={{ left: `${(mark / winningScore) * 100}%` }}
                    />
                  ))}
                </div>
                
                {/* Progress */}
                <div 
                  className={`h-full ${getPlayerColor(index)} transition-all duration-500 rounded-full`}
                  style={{ width: `${percentage}%` }}
                />
                
                {/* Peg marker */}
                <div 
                  className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${getPlayerColor(index)} border-2 border-white shadow-lg transition-all duration-500`}
                  style={{ left: `calc(${percentage}% - 6px)` }}
                />
              </div>
              
              <span className="text-sm font-bold text-poker-gold w-10 text-right">
                {score}
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Skunk lines */}
      <div className="flex justify-between mt-1 px-16 text-[10px] text-amber-400/60">
        <span>Skunk (91)</span>
        <span>Double (61)</span>
      </div>
    </div>
  );
};
