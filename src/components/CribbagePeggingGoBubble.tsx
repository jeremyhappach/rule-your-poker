/**
 * CribbagePeggingGoBubble
 *
 * Renders a light-green "Go" speech bubble for every REMOTE player whose
 * forced-Go is currently active. The local player's Go presentation is
 * intentionally omitted (contract): when the blocked player is the local
 * viewer no bubble is rendered, and no active-pane / lower-zone anchor
 * is consulted.
 *
 * Placement (remote only):
 *   Anchor : [data-chip-center="${position}"]  (canonical chipstack)
 *   Body   : offset INWARD from the chipstack toward the felt center
 *   Tail   : rotated triangle pointing OUTWARD back to the chipstack
 *   Felt   : requires [data-canonical-felt-surface] to derive the
 *            inward direction. If missing, the bubble is not rendered.
 *
 * Ownership contract:
 *   Bubble truth derives purely from authoritative cribbage state:
 *     pegging.goCalledBy ∪ pegging.pendingGoBubblePlayerIds
 *   Latch clears at the authoritative lifecycle boundary
 *   (beginNewPeggingRun clears goCalledBy and prunes
 *   pendingGoBubblePlayerIds on the next play). No local timer.
 *
 * Anchor safety:
 *   Target skipped when its [data-chip-center] or the felt anchor is
 *   missing. No coordinates are retained across anchor loss.
 */
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CribbageState } from '@/lib/cribbageTypes';

interface CribbagePeggingGoBubbleProps {
  cribbageState: CribbageState | null;
  /** Maps player id → seat position (1..N) used by [data-chip-center]. */
  playerPositionById: Map<string, number>;
  /**
   * Local viewer's player id — used to SUPPRESS the local bubble.
   * The local Go presentation path was removed by contract; when the
   * blocked player is the local viewer, no bubble is rendered.
   */
  localPlayerId?: string | null;
  /** Suppress bubbles when non-pegging presentation is in flight
   *  (counting outro, terminal path, etc.). */
  isPeggingPresentation: boolean;
}

interface Placement {
  playerId: string;
  position: number;
  /** Bubble body center (viewport px). */
  bubbleX: number;
  bubbleY: number;
  /** Tail rotation in degrees (0 = tail points right / east). */
  tailAngleDeg: number;
  /** Distance from the bubble center to the center of the SVG tail. */
  tailCenterOffsetPx: number;
}

const BUBBLE_WIDTH_PX = 58;
const BUBBLE_HEIGHT_PX = 34;
const BUBBLE_RADIUS_PX = 12;
const TAIL_LENGTH_PX = 14;
const TAIL_HEIGHT_PX = 14;
const TAIL_BODY_OVERLAP_PX = 3;
const CHIP_CLEARANCE_PX = 3;

// Soft, readable green — Tailwind emerald-200 body, emerald-700 border.
const BUBBLE_FILL = '#a7f3d0';
const BUBBLE_BORDER = '#047857';

function ellipseRadiusAlongVector(
  unitX: number,
  unitY: number,
  radiusX: number,
  radiusY: number,
): number {
  if (radiusX <= 0 || radiusY <= 0) return 0;
  const denominator = Math.sqrt(
    (unitX * unitX) / (radiusX * radiusX) +
      (unitY * unitY) / (radiusY * radiusY),
  );
  return denominator > 0 ? 1 / denominator : 0;
}

export const CribbagePeggingGoBubble = ({
  cribbageState,
  playerPositionById,
  localPlayerId,
  isPeggingPresentation,
}: CribbagePeggingGoBubbleProps) => {
  const goCalledBy = cribbageState?.pegging.goCalledBy ?? [];
  const pendingBubbleIds = cribbageState?.pegging.pendingGoBubblePlayerIds ?? [];
  const playerStates = cribbageState?.playerStates ?? {};
  const phase = cribbageState?.phase;

  const targets: { playerId: string; position: number }[] = [];
  if (isPeggingPresentation && phase === 'pegging') {
    const seen = new Set<string>();
    for (const pid of [...goCalledBy, ...pendingBubbleIds]) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      // Contract: no bubble for the local player.
      if (localPlayerId && pid === localPlayerId) continue;
      const ps = playerStates[pid];
      if (!ps) continue;
      const isPending = pendingBubbleIds.includes(pid);
      // A blocked player with no cards is no longer a legal Go target
      // (hand exhausted); skip unless we're inside the pending-latch
      // window awaiting the Go-point presentation.
      if (!isPending && ps.hand.length === 0) continue;
      const pos = playerPositionById.get(pid);
      if (pos == null) continue;
      targets.push({ playerId: pid, position: pos });
    }
  }

  const signature = targets.map(t => `${t.playerId}:${t.position}`).join('|');
  const [placements, setPlacements] = useState<Placement[]>([]);

  useLayoutEffect(() => {
    if (targets.length === 0) {
      setPlacements([]);
      return;
    }
    let raf = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;

      const next: Placement[] = [];
      let missing = false;

      const felt = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
      const feltRect = felt?.getBoundingClientRect() ?? null;
      const feltCx = feltRect ? feltRect.left + feltRect.width / 2 : null;
      const feltCy = feltRect ? feltRect.top + feltRect.height / 2 : null;

      for (const t of targets) {
        const chip = document.querySelector<HTMLElement>(
          `[data-chip-center="${t.position}"]`,
        );
        if (!chip || feltCx == null || feltCy == null) {
          missing = true;
          continue;
        }
        const cr = chip.getBoundingClientRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        const dx = feltCx - cx;
        const dy = feltCy - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        // Resolve both shapes along the live seat-to-felt axis. The tail can
        // overlap the body but its tip stops outside the chip perimeter.
        const bodyEdgeRadius = ellipseRadiusAlongVector(
          -ux,
          -uy,
          BUBBLE_WIDTH_PX / 2,
          BUBBLE_HEIGHT_PX / 2,
        );
        const tailBaseOffsetPx = Math.max(
          0,
          bodyEdgeRadius - TAIL_BODY_OVERLAP_PX,
        );
        const tailCenterOffsetPx = tailBaseOffsetPx + TAIL_LENGTH_PX / 2;
        const tailTipReachPx = tailBaseOffsetPx + TAIL_LENGTH_PX;
        const chipEdgeRadius = ellipseRadiusAlongVector(
          ux,
          uy,
          cr.width / 2,
          cr.height / 2,
        );
        const bubbleOffsetPx =
          chipEdgeRadius + CHIP_CLEARANCE_PX + tailTipReachPx;
        const bubbleX = cx + ux * bubbleOffsetPx;
        const bubbleY = cy + uy * bubbleOffsetPx;
        // Tail points OUTWARD back to the chipstack.
        const tailAngleDeg = (Math.atan2(-uy, -ux) * 180) / Math.PI;
        next.push({
          playerId: t.playerId,
          position: t.position,
          bubbleX,
          bubbleY,
          tailAngleDeg,
          tailCenterOffsetPx,
        });
      }

      setPlacements(prev => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => {
            const n = next[i];
            if (p.playerId !== n.playerId) return false;
            if (Math.abs(p.bubbleX - n.bubbleX) > 0.5) return false;
            if (Math.abs(p.bubbleY - n.bubbleY) > 0.5) return false;
            if (Math.abs(p.tailAngleDeg - n.tailAngleDeg) > 0.5) return false;
            if (
              Math.abs(p.tailCenterOffsetPx - n.tailCenterOffsetPx) > 0.5
            ) return false;
            return true;
          })
        ) {
          return prev;
        }
        return next;
      });

      if (missing) {
        raf = requestAnimationFrame(measure);
      }
    };

    raf = requestAnimationFrame(measure);
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (placements.length === 0) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {placements.map(p => (
          <div
            key={p.playerId}
            data-cribbage-go-bubble={p.position}
            data-cribbage-go-orientation="remote"
            className="pointer-events-none fixed z-50 animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: p.bubbleX,
              top: p.bubbleY,
              transform: 'translate(-50%, -50%)',
              isolation: 'isolate',
            }}
          >
            <svg
              aria-hidden
              data-cribbage-go-tail
              viewBox="0 0 16 14"
              className="absolute left-1/2 top-1/2"
              style={{
                width: TAIL_LENGTH_PX + 2,
                height: TAIL_HEIGHT_PX,
                overflow: 'visible',
                transform: `translate(-50%, -50%) rotate(${p.tailAngleDeg}deg) translate(${p.tailCenterOffsetPx}px, 0)`,
                transformOrigin: 'center',
                zIndex: 0,
              }}
            >
              <path
                d="M 1 1 L 15 7 L 1 13 Z"
                fill={BUBBLE_FILL}
                stroke={BUBBLE_BORDER}
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div
              className="relative flex items-center justify-center font-extrabold uppercase tracking-wide"
              style={{
                width: BUBBLE_WIDTH_PX,
                height: BUBBLE_HEIGHT_PX,
                borderRadius: BUBBLE_RADIUS_PX,
                fontSize: 15,
                lineHeight: 1,
                textAlign: 'center',
                color: '#000',
                backgroundColor: BUBBLE_FILL,
                border: `2px solid ${BUBBLE_BORDER}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                zIndex: 1,
              }}
            >
              Go
            </div>
          </div>
      ))}
    </>,
    document.body,
  );
};
