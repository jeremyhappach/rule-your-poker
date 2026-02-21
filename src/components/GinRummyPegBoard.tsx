import type { GinRummyState } from '@/lib/ginRummyTypes';

interface Player {
  id: string;
  user_id: string;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface GinRummyPegBoardProps {
  ginState: GinRummyState;
  currentPlayerId: string | undefined;
  opponentId: string;
  getPlayerUsername: (playerId: string) => string;
}

const PLAYER_COLORS = ['bg-red-500', 'bg-blue-500'];
const PLAYER_TEXT_COLORS = ['text-red-200', 'text-blue-200'];

export const GinRummyPegBoard = ({
  ginState,
  currentPlayerId,
  opponentId,
  getPlayerUsername,
}: GinRummyPegBoardProps) => {
  const playerIds = [currentPlayerId ?? '', opponentId];

  return (
    <div className="space-y-1 w-full">
      {playerIds.map((pid, index) => {
        const score = ginState.matchScores[pid] || 0;
        const percentage = Math.min(100, (score / ginState.pointsToWin) * 100);
        const displayName = getPlayerUsername(pid);
        // Ensure a minimum width so "0" is always readable
        const barWidth = Math.max(12, percentage);

        return (
          <div key={pid} className="flex items-center gap-1.5">
            {/* Player name */}
            <span className="text-[9px] text-white/80 w-12 truncate text-right font-medium">
              {displayName}
            </span>

            {/* Track */}
            <div className="flex-1 h-3.5 bg-white/20 rounded-full overflow-hidden relative">
              {/* Progress fill */}
              <div
                className={`h-full ${PLAYER_COLORS[index]} transition-all duration-500 rounded-full relative`}
                style={{ width: `${barWidth}%` }}
              >
                {/* Score overlaid inside the fill, left-aligned */}
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white drop-shadow-sm leading-none">
                  {score}
                </span>
              </div>

              {/* Peg marker at progress edge */}
              {percentage > 0 && (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${PLAYER_COLORS[index]} border border-white shadow transition-all duration-500`}
                  style={{ left: `calc(${percentage}% - 4px)` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
