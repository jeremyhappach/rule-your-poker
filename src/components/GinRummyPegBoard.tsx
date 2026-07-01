import type { GinRummyState } from '@/lib/ginRummyTypes';

interface GinRummyPegBoardProps {
  // Decoupled from a live ginState so the rail can be driven by a
  // persistent match snapshot that survives identity-boundary nulls
  // between hands within a dealer game. The rail is persistent match
  // state — never gated on opening-deal phases.
  matchScores: Record<string, number>;
  pointsToWin: number;
  playerIds: [string, string]; // [self, opponent]
  getPlayerUsername: (playerId: string) => string;
  /** Legacy passthrough — if provided, derives the three required
   *  fields above so existing call sites keep compiling during cutover. */
  ginState?: GinRummyState;
  currentPlayerId?: string | undefined;
  opponentId?: string;
}

const PLAYER_COLORS = ['bg-red-500', 'bg-blue-500'];

export const GinRummyPegBoard = (props: GinRummyPegBoardProps) => {
  const matchScores = props.matchScores ?? props.ginState?.matchScores ?? {};
  const pointsToWin = props.pointsToWin ?? props.ginState?.pointsToWin ?? 100;
  const playerIds: [string, string] = props.playerIds
    ?? [props.currentPlayerId ?? '', props.opponentId ?? ''];
  const { getPlayerUsername } = props;

  // Single authoritative denominator: match target score (100 by default).
  const denom = pointsToWin > 0 ? pointsToWin : 100;

  return (
    <div className="space-y-1 w-full">
      {playerIds.map((pid, index) => {
        const score = matchScores[pid] || 0;
        // fill = clamp(playerMatchScore / matchTargetScore, 0, 1)
        const percentage = Math.max(0, Math.min(100, (score / denom) * 100));
        const displayName = getPlayerUsername(pid);
        // Visual: keep a small minimum stub once score > 0 so the
        // colored fill is visible. Denominator is unchanged.
        const barWidth = score === 0 ? 0 : Math.max(12, percentage);

        return (
          <div key={pid} className="flex items-center gap-1.5">
            {/* Player name (left gutter) */}
            <span className="text-[9px] text-white/80 w-12 shrink-0 truncate text-right font-medium">
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
            </div>

            {/* Symmetric right spacer — mirrors the left name gutter
                (w-12 + gap-1.5) so the [name + track] assembly's
                measured bounds center on the slot's X anchor instead
                of biasing to one side. Presentation-only; does not
                change rail width, anchor, scores, or logic. */}
            <span aria-hidden="true" className="w-12 shrink-0" />
          </div>
        );
      })}
    </div>
  );
};
