import { useRef } from 'react';
import type { CribbagePlayerState } from '@/lib/cribbageTypes';
import { getDisplayName } from '@/lib/botAlias';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { useCribbageGameplayGeometry } from '@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';

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

// ── Wave 5C Phase 4B.2 — Rect-driven sizing constants ──
// The pegboard rect (≈ 39px at 390px portrait) is authoritative. Row pitch
// is bounded by [MIN_ROW_PX, MAX_ROW_PX] so we never collapse into
// unreadability or balloon beyond the descriptor's preferred extent.
const MIN_ROW_PX = 14;
const MAX_ROW_PX = 26;
const INTER_ROW_GAP_PX = 4;
const PEGBOARD_ARTIFACT_ID = 'cribbage.pegboard';

export const CribbagePegBoard = ({
  players,
  playerStates,
  winningScore,
  overrideScores,
}: CribbagePegBoardProps) => {
  const getPlayerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length];

  // ── Rect from provider (single source of truth) ──
  const { placementsById, lastValidPlacementsById } = useCribbageGameplayGeometry();
  const { vminInPx } = useLiveGeometryConstraints();
  const current = placementsById.get(PEGBOARD_ARTIFACT_ID);
  const placement = current && current.visible
    ? current
    : lastValidPlacementsById.get(PEGBOARD_ARTIFACT_ID);
  const assignedHeightPx =
    placement && placement.visible && vminInPx > 0
      ? placement.rect.height.unit === 'vmin'
        ? placement.rect.height.value * vminInPx
        : placement.rect.height.value
      : 0;

  // ── Pegboard score regression instrumentation ──
  const prevRenderedScoresRef = useRef<Record<string, number>>({});
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const currentDisplayScores: Record<string, number> = {};
  for (const player of players) {
    const state = playerStates[player.id];
    const rawPegScore = state?.pegScore ?? undefined;
    const overrideScore = overrideScores?.[player.id];
    const displayScore = overrideScore ?? rawPegScore;
    const prevKnown = prevRenderedScoresRef.current[player.id];
    currentDisplayScores[player.id] = displayScore !== undefined ? displayScore : (prevKnown ?? 0);
  }

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
      },
    });
  }

  const prevTraceScoresRef = useRef<string>('');
  const currentTraceKey = JSON.stringify(currentDisplayScores);
  if (currentTraceKey !== prevTraceScoresRef.current) {
    prevTraceScoresRef.current = currentTraceKey;
    logDebugEvent({
      gameId: 'pegboard',
      eventType: 'crib:last-pegging-score-rendered',
      payload: {
        renderCount: renderCountRef.current,
        displayedScores: Object.fromEntries(
          Object.entries(currentDisplayScores).map(([id, s]) => [id.slice(0, 8), s])
        ),
        timestamp: Date.now(),
      },
    });
  }

  prevRenderedScoresRef.current = { ...currentDisplayScores };

  // ── Rect-driven sizing (does NOT divide by player count) ──
  // The descriptor preferredSize is 60×10vmin; canonical Cribbage is 2-player.
  // We pick a pitch that fits the assigned rect for 2 players, bounded by
  // legibility. Larger seat counts will trigger the intrinsic-exceeds-rect
  // fault below rather than silently collapsing.
  const useRectSizing = assignedHeightPx > 0;
  // Target: 2 rows + 1 gap fit inside assignedHeightPx.
  const targetRowPx = useRectSizing
    ? Math.min(
        MAX_ROW_PX,
        Math.max(MIN_ROW_PX, Math.floor((assignedHeightPx - INTER_ROW_GAP_PX) / 2)),
      )
    : 16;

  const intrinsicHeightPx =
    players.length * targetRowPx + Math.max(0, players.length - 1) * INTER_ROW_GAP_PX;

  const intrinsicExceedsRect =
    useRectSizing && intrinsicHeightPx > assignedHeightPx + 0.5;

  const faultLatchRef = useRef<string>('');
  if (intrinsicExceedsRect) {
    const key = `${players.length}:${assignedHeightPx.toFixed(1)}:${intrinsicHeightPx.toFixed(1)}`;
    if (faultLatchRef.current !== key) {
      faultLatchRef.current = key;
      // Greppable prefix matches the wave4 layout-fault telemetry convention.
      // We do not extend LayoutFaultCode (descriptor-side); this is a
      // consumer-side intrinsic overflow signal.
      console.warn('[wave4:layout_fault]', {
        code: 'pegboard_intrinsic_exceeds_rect',
        artifactIds: [PEGBOARD_ARTIFACT_ID],
        playerCount: players.length,
        assignedHeightPx: Math.round(assignedHeightPx),
        intrinsicHeightPx,
        targetRowPx,
      });
      logDebugEvent({
        gameId: 'pegboard',
        eventType: 'wave4:layout_fault',
        payload: {
          code: 'pegboard_intrinsic_exceeds_rect',
          artifactIds: [PEGBOARD_ARTIFACT_ID],
          playerCount: players.length,
          assignedHeightPx: Math.round(assignedHeightPx),
          intrinsicHeightPx,
          targetRowPx,
        },
      });
    }
  }

  // Derived font / track / peg sizes — proportional to row pitch.
  const labelFontPx = Math.max(8, Math.round(targetRowPx * 0.62));
  const scoreFontPx = Math.max(9, Math.round(targetRowPx * 0.72));
  const trackHeightPx = Math.max(6, Math.round(targetRowPx * 0.62));
  const pegSizePx = Math.max(6, Math.round(trackHeightPx * 0.85));
  const labelWidthPx = Math.max(40, Math.round(targetRowPx * 3.2));
  const scoreWidthPx = Math.max(22, Math.round(targetRowPx * 1.6));
  const horizontalGapPx = Math.max(4, Math.round(targetRowPx * 0.45));

  // Fallback (cold-start / no rect yet) keeps the previous tailwind tokens
  // so we never render an unsized board.
  if (!useRectSizing) {
    return (
      <div className="space-y-1.5" data-pegboard-sizing="fallback">
        {players.map((player, index) => {
          const score = Math.max(0, currentDisplayScores[player.id] ?? 0);
          const percentage = Math.min(100, (score / winningScore) * 100);
          const displayPercentage = score > 0 ? Math.max(2, percentage) : 0;
          const displayName = getDisplayName(players, player, player.profiles?.username || 'Player');
          return (
            <div key={player.id} className="flex items-center gap-2">
              <span className="text-[10px] text-white/80 w-14 truncate">{displayName}</span>
              <div className="flex-1 h-3 bg-white/80 rounded-full overflow-hidden relative">
                <div
                  className={`h-full ${getPlayerColor(index)} transition-all duration-500 rounded-full`}
                  style={{ width: `${displayPercentage}%` }}
                />
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${getPlayerColor(index)} border border-white shadow transition-all duration-500`}
                  style={{ left: `calc(${displayPercentage}% - 5px)` }}
                />
              </div>
              <span className="text-xs font-bold text-poker-gold w-8 text-right">{score}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      data-pegboard-sizing="rect-driven"
      data-pegboard-assigned-height-px={Math.round(assignedHeightPx)}
      data-pegboard-row-px={targetRowPx}
      data-pegboard-intrinsic-px={intrinsicHeightPx}
      data-pegboard-intrinsic-exceeds={intrinsicExceedsRect ? 'true' : 'false'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${INTER_ROW_GAP_PX}px`,
        width: '100%',
        // Hard-cap to the assigned rect; if intrinsic exceeds, we surface a
        // fault rather than silently clip — but we still don't intrude into
        // sibling artifacts.
        maxHeight: `${assignedHeightPx}px`,
        overflow: 'hidden',
      }}
    >
      {players.map((player, index) => {
        const score = Math.max(0, currentDisplayScores[player.id] ?? 0);
        const percentage = Math.min(100, (score / winningScore) * 100);
        const displayPercentage = score > 0 ? Math.max(2, percentage) : 0;
        const displayName = getDisplayName(players, player, player.profiles?.username || 'Player');

        return (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${horizontalGapPx}px`,
              height: `${targetRowPx}px`,
              minHeight: 0,
            }}
          >
            <span
              style={{
                fontSize: `${labelFontPx}px`,
                lineHeight: 1,
                width: `${labelWidthPx}px`,
                color: 'rgba(255,255,255,0.8)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </span>

            <div
              style={{
                flex: 1,
                position: 'relative',
                height: `${trackHeightPx}px`,
                background: 'rgba(255,255,255,0.8)',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                className={`${getPlayerColor(index)} transition-all duration-500`}
                style={{
                  height: '100%',
                  width: `${displayPercentage}%`,
                  borderRadius: '9999px',
                }}
              />
              <div
                className={`${getPlayerColor(index)} transition-all duration-500`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: `${pegSizePx}px`,
                  height: `${pegSizePx}px`,
                  borderRadius: '9999px',
                  border: '1px solid white',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  left: `calc(${displayPercentage}% - ${pegSizePx / 2}px)`,
                }}
              />
            </div>

            <span
              className="text-poker-gold"
              style={{
                fontSize: `${scoreFontPx}px`,
                lineHeight: 1,
                fontWeight: 700,
                width: `${scoreWidthPx}px`,
                textAlign: 'right',
              }}
            >
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
};
