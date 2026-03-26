import { useRef } from 'react';
import type { CribbagePlayerState } from '@/lib/cribbageTypes';
import { getDisplayName } from '@/lib/botAlias';
import { logDebugEvent } from '@/lib/debugEventLogger';

interface Player {
  id: string;
  user_id: string;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface CribbagePegBoardProps {
  players: Player[];
  playerStates: Record<string, CribbagePlayerState>;
  winningScore: number;
  overrideScores?: Record<string, number>;
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
  overrideScores,
}: CribbagePegBoardProps) => {
  const getPlayerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length];

  // ── Pegboard score regression instrumentation ──
  const prevRenderedScoresRef = useRef<Record<string, number>>({});
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Build current display scores and detect regressions
  const currentDisplayScores: Record<string, number> = {};
  for (const player of players) {
    const state = playerStates[player.id];
    const rawPegScore = state?.pegScore ?? 0;
    const overrideScore = overrideScores?.[player.id];
    const displayScore = overrideScore ?? rawPegScore;
    currentDisplayScores[player.id] = displayScore;
  }

  // Check for regression: any player's score decreased from previous render
  const prevScores = prevRenderedScoresRef.current;
  const regressions: Array<{ playerId: string; prev: number; now: number; source: string }> = [];
  for (const [pid, nowScore] of Object.entries(currentDisplayScores)) {
    const prevScore = prevScores[pid];
    if (prevScore !== undefined && nowScore < prevScore) {
      regressions.push({
        playerId: pid.slice(0, 8),
        prev: prevScore,
        now: nowScore,
        source: overrideScores?.[pid] !== undefined ? 'override' : 'pegScore',
      });
    }
  }

  if (regressions.length > 0) {
    console.warn('[PEGBOARD REGRESSION]', regressions);
    logDebugEvent({
      gameId: 'pegboard',
      eventType: 'crib:pegboard:score_regression',
      payload: {
        regressions,
        renderCount: renderCountRef.current,
        hasOverrides: !!overrideScores,
        overridePlayerIds: overrideScores ? Object.keys(overrideScores).map(id => id.slice(0, 8)) : [],
        rawPegScores: Object.fromEntries(
          players.map(p => [p.id.slice(0, 8), playerStates[p.id]?.pegScore ?? 0])
        ),
        overrideScoreValues: overrideScores
          ? Object.fromEntries(Object.entries(overrideScores).map(([id, s]) => [id.slice(0, 8), s]))
          : null,
      },
    });
  }

  prevRenderedScoresRef.current = { ...currentDisplayScores };
  
  return (
    <div className="space-y-1.5">
      {/* Progress bars for each player */}
      {players.map((player, index) => {
        const state = playerStates[player.id];
        // Use override score during counting phase, otherwise use actual pegScore
        const score = overrideScores?.[player.id] ?? state?.pegScore ?? 0;
        const percentage = Math.min(100, (score / winningScore) * 100);
        // Ensure peg is always visible even at 0 — minimum 2% width
        const displayPercentage = score > 0 ? Math.max(2, percentage) : 0;
        // Use bot alias for display name
        const displayName = getDisplayName(players, player, player.profiles?.username || 'Player');
        
        return (
          <div key={player.id} className="flex items-center gap-2">
            <span className="text-[10px] text-white/80 w-14 truncate">
              {displayName}
            </span>
            
            {/* White background for unfilled area */}
            <div className="flex-1 h-3 bg-white/80 rounded-full overflow-hidden relative">
              {/* Progress */}
              <div 
                className={`h-full ${getPlayerColor(index)} transition-all duration-500 rounded-full`}
                style={{ width: `${displayPercentage}%` }}
              />
              
              {/* Peg marker */}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${getPlayerColor(index)} border border-white shadow transition-all duration-500`}
                style={{ left: `calc(${displayPercentage}% - 5px)` }}
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
