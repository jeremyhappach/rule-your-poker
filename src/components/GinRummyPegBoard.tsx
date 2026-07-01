import { useLayoutEffect, useRef, useState } from 'react';
import type { GinRummyState } from '@/lib/ginRummyTypes';
import { useDraftedGeometryOverrides } from '@/lib/geometryLab/store';
import type { AnchorOrigin } from '@/lib/wave4LayoutResolver/types';

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

const originXFor = (origin: AnchorOrigin | null | undefined): number => {
  switch (origin) {
    case 'topLeft':
    case 'leftCenter':
      return 0;
    case 'rightCenter':
      return 1;
    case 'topCenter':
    case 'bottomCenter':
    case 'center':
    default:
      return 0.5;
  }
};

const intersectHorizontal = (a: DOMRect, b: DOMRect): { left: number; right: number } | null => {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  return right > left ? { left, right } : null;
};

export const GinRummyPegBoard = (props: GinRummyPegBoardProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [anchorOffsetPx, setAnchorOffsetPx] = useState(0);
  const [metrics, setMetrics] = useState<{
    anchorX: number;
    visualLeft: number;
    visualRight: number;
    visualWidth: number;
    visualCenter: number;
    trackLeft: number;
    trackRight: number;
    trackWidth: number;
  } | null>(null);

  const matchScores = props.matchScores ?? props.ginState?.matchScores ?? {};
  const pointsToWin = props.pointsToWin ?? props.ginState?.pointsToWin ?? 100;
  const playerIds: [string, string] = props.playerIds
    ?? [props.currentPlayerId ?? '', props.opponentId ?? ''];
  const { getPlayerUsername } = props;
  const overrides = useDraftedGeometryOverrides();
  const attachmentOriginX = originXFor(overrides.get('gin.pegboard')?.anchor_origin ?? 'center');

  // Single authoritative denominator: match target score (100 by default).
  const denom = pointsToWin > 0 ? pointsToWin : 100;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slot = root.closest<HTMLElement>('[data-wave5-gin-slot="gin.pegboard"]');
        if (!slot) return;

        const slotRect = slot.getBoundingClientRect();
        const resolvedAnchorX = slotRect.left + slotRect.width * attachmentOriginX;

        const visibleEdges: Array<{ left: number; right: number }> = [];
        root.querySelectorAll<HTMLElement>('[data-gin-pegboard-label]').forEach((label) => {
          const text = label.querySelector<HTMLElement>('[data-gin-pegboard-label-text]');
          if (!text) return;
          const visible = intersectHorizontal(text.getBoundingClientRect(), label.getBoundingClientRect());
          if (visible) visibleEdges.push(visible);
        });
        const tracks = Array.from(root.querySelectorAll<HTMLElement>('[data-gin-pegboard-track]'));
        tracks.forEach((track) => {
          const rect = track.getBoundingClientRect();
          if (rect.width > 0) visibleEdges.push({ left: rect.left, right: rect.right });
        });

        if (visibleEdges.length === 0 || tracks.length === 0) return;

        const visualLeft = Math.min(...visibleEdges.map((r) => r.left));
        const visualRight = Math.max(...visibleEdges.map((r) => r.right));
        const visualWidth = visualRight - visualLeft;
        if (visualWidth <= 0) return;

        const currentAnchorPoint = visualLeft + visualWidth * attachmentOriginX;
        const delta = resolvedAnchorX - currentAnchorPoint;
        if (Math.abs(delta) > 0.5) {
          setAnchorOffsetPx((current) => current + delta);
          return;
        }

        const trackRect = tracks[0].getBoundingClientRect();
        const nextMetrics = {
          anchorX: resolvedAnchorX,
          visualLeft,
          visualRight,
          visualWidth,
          visualCenter: visualLeft + visualWidth / 2,
          trackLeft: trackRect.left,
          trackRight: trackRect.right,
          trackWidth: trackRect.width,
        };
        setMetrics((current) => {
          if (
            current &&
            Math.abs(current.anchorX - nextMetrics.anchorX) < 0.25 &&
            Math.abs(current.visualLeft - nextMetrics.visualLeft) < 0.25 &&
            Math.abs(current.visualRight - nextMetrics.visualRight) < 0.25 &&
            Math.abs(current.trackLeft - nextMetrics.trackLeft) < 0.25 &&
            Math.abs(current.trackRight - nextMetrics.trackRight) < 0.25
          ) {
            return current;
          }
          return nextMetrics;
        });
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const slot = root.closest<HTMLElement>('[data-wave5-gin-slot="gin.pegboard"]');
    if (slot) observer.observe(slot);
    window.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  return (
    <div
      ref={rootRef}
      className="space-y-1 w-full"
      data-gin-score-rail-anchor-x={metrics ? metrics.anchorX.toFixed(2) : undefined}
      data-gin-score-rail-visual-left={metrics ? metrics.visualLeft.toFixed(2) : undefined}
      data-gin-score-rail-visual-right={metrics ? metrics.visualRight.toFixed(2) : undefined}
      data-gin-score-rail-visual-width={metrics ? metrics.visualWidth.toFixed(2) : undefined}
      data-gin-score-rail-visual-center={metrics ? metrics.visualCenter.toFixed(2) : undefined}
      data-gin-score-rail-track-left={metrics ? metrics.trackLeft.toFixed(2) : undefined}
      data-gin-score-rail-track-right={metrics ? metrics.trackRight.toFixed(2) : undefined}
      data-gin-score-rail-track-width={metrics ? metrics.trackWidth.toFixed(2) : undefined}
      style={{ transform: `translateX(${anchorOffsetPx}px)` }}
    >
      {playerIds.map((pid, index) => {
        const score = matchScores[pid] || 0;
        const percentage = Math.max(0, Math.min(100, (score / denom) * 100));
        const displayName = getPlayerUsername(pid);
        const barWidth = score === 0 ? 0 : Math.max(12, percentage);

        return (
          <div key={pid} className="flex items-center gap-1.5">
            <span
              className="text-[9px] text-white/80 w-12 truncate text-right font-medium"
              data-gin-pegboard-label="true"
            >
              <span data-gin-pegboard-label-text="true">{displayName}</span>
            </span>
            <div
              className="flex-1 h-3.5 bg-white/20 rounded-full overflow-hidden relative"
              data-gin-pegboard-track="true"
            >
              <div
                className={`h-full ${PLAYER_COLORS[index]} transition-all duration-500 rounded-full relative`}
                style={{ width: `${barWidth}%` }}
              >
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white drop-shadow-sm leading-none">
                  {score}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>

  );
};
