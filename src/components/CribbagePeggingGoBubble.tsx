/**
 * CribbagePeggingGoBubble
 *
 * Renders a white "Go" speech bubble for every player whose forced-Go
 * is currently active. Two placement contracts, chosen by orientation:
 *
 *   • Remote blocked player
 *       Anchor : [data-chip-center="${position}"]  (canonical chipstack)
 *       Body   : offset INWARD from the chipstack toward the felt center
 *       Tail   : rotated triangle pointing OUTWARD back to the chipstack
 *       Felt   : requires [data-canonical-felt-surface] to derive
 *                inward direction. If missing, the bubble is not rendered
 *                (no felt-center fallback, no fixed-coord retention).
 *
 *   • Local blocked player
 *       Anchor : [data-active-hand-lower-zone]      (active-player pane)
 *       Body   : centered horizontally over the lower action zone,
 *                sitting on the zone's vertical mid-line
 *       Tail   : none. The bubble is intrinsically associated with the
 *                local pane by position; no felt geometry involved.
 *
 * Ownership contract:
 *   Bubble truth derives purely from authoritative cribbage state:
 *     pegging.goCalledBy ∪ pegging.pendingGoBubblePlayerIds
 *   Latch clears at the authoritative lifecycle boundary
 *   (beginNewPeggingRun clears goCalledBy and prunes
 *   pendingGoBubblePlayerIds on the next play). No local timer.
 *
 * Anchor safety:
 *   • Remote target skipped when its [data-chip-center] is missing.
 *   • Local target skipped when [data-active-hand-lower-zone] is
 *     missing. No coordinates are retained across anchor loss.
 */
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CribbageState } from '@/lib/cribbageTypes';

interface CribbagePeggingGoBubbleProps {
  cribbageState: CribbageState | null;
  /** Maps player id → seat position (1..N) used by [data-chip-center]. */
  playerPositionById: Map<string, number>;
  /** Local viewer's player id — enables the active-pane placement. */
  localPlayerId?: string | null;
  /** Suppress bubbles when non-pegging presentation is in flight
   *  (counting outro, terminal path, etc.). */
  isPeggingPresentation: boolean;
}

type Orientation = 'remote' | 'local';

interface RemotePlacement {
  playerId: string;
  orientation: 'remote';
  position: number;
  /** Bubble body center (viewport px). */
  bubbleX: number;
  bubbleY: number;
  /** Tail rotation in degrees (0 = tail points right / east). */
  tailAngleDeg: number;
}

interface LocalPlacement {
  playerId: string;
  orientation: 'local';
  /** Bubble body center (viewport px). */
  bubbleX: number;
  bubbleY: number;
}

type Placement = RemotePlacement | LocalPlacement;

const REMOTE_BUBBLE_OFFSET_PX = 44;
const TAIL_LENGTH_PX = 10;

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

  const targets: { playerId: string; orientation: Orientation; position: number | null }[] = [];
  if (isPeggingPresentation && phase === 'pegging') {
    const seen = new Set<string>();
    for (const pid of [...goCalledBy, ...pendingBubbleIds]) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const ps = playerStates[pid];
      if (!ps) continue;
      const isPending = pendingBubbleIds.includes(pid);
      // A blocked player with no cards is no longer a legal Go target
      // (hand exhausted); skip unless we're inside the pending-latch
      // window awaiting the Go-point presentation.
      if (!isPending && ps.hand.length === 0) continue;
      const isLocal = !!localPlayerId && pid === localPlayerId;
      const pos = playerPositionById.get(pid) ?? null;
      targets.push({
        playerId: pid,
        orientation: isLocal ? 'local' : 'remote',
        position: pos,
      });
    }
  }

  const signature = targets
    .map(t => `${t.playerId}:${t.orientation}:${t.position ?? 'x'}`)
    .join('|');
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

      // Felt geometry (remote inward direction only).
      const felt = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
      const feltRect = felt?.getBoundingClientRect() ?? null;
      const feltCx = feltRect ? feltRect.left + feltRect.width / 2 : null;
      const feltCy = feltRect ? feltRect.top + feltRect.height / 2 : null;

      for (const t of targets) {
        if (t.orientation === 'local') {
          const zone = document.querySelector<HTMLElement>('[data-active-hand-lower-zone]');
          if (!zone) {
            // Anchor missing — no fallback, no stale coordinates.
            missing = true;
            continue;
          }
          const r = zone.getBoundingClientRect();
          const bubbleX = r.left + r.width / 2;
          const bubbleY = r.top + r.height / 2;
          next.push({
            playerId: t.playerId,
            orientation: 'local',
            bubbleX,
            bubbleY,
          });
          continue;
        }

        // Remote — needs chip anchor AND felt center.
        if (t.position == null) continue;
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
        const bubbleX = cx + ux * REMOTE_BUBBLE_OFFSET_PX;
        const bubbleY = cy + uy * REMOTE_BUBBLE_OFFSET_PX;
        // Tail points OUTWARD back to the chipstack.
        const tailAngleDeg = (Math.atan2(-uy, -ux) * 180) / Math.PI;
        next.push({
          playerId: t.playerId,
          orientation: 'remote',
          position: t.position,
          bubbleX,
          bubbleY,
          tailAngleDeg,
        });
      }

      setPlacements(prev => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => {
            const n = next[i];
            if (p.orientation !== n.orientation) return false;
            if (p.playerId !== n.playerId) return false;
            if (Math.abs(p.bubbleX - n.bubbleX) > 0.5) return false;
            if (Math.abs(p.bubbleY - n.bubbleY) > 0.5) return false;
            if (p.orientation === 'remote' && n.orientation === 'remote') {
              if (Math.abs(p.tailAngleDeg - n.tailAngleDeg) > 0.5) return false;
            }
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
      {placements.map(p => {
        const isLocal = p.orientation === 'local';
        return (
          <div
            key={`${p.playerId}:${p.orientation}`}
            data-cribbage-go-bubble={
              p.orientation === 'remote' ? p.position : `local:${p.playerId}`
            }
            data-cribbage-go-orientation={p.orientation}
            className="pointer-events-none fixed z-50 animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: p.bubbleX,
              top: p.bubbleY,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="relative rounded-full bg-white text-black font-bold uppercase tracking-wide shadow-lg ring-1 ring-black/10"
              style={{
                fontSize: 15,
                lineHeight: 1,
                padding: '6px 12px',
                minWidth: 40,
                textAlign: 'center',
              }}
            >
              Go
              {!isLocal && (
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: `${TAIL_LENGTH_PX}px solid white`,
                    borderTop: `${TAIL_LENGTH_PX * 0.7}px solid transparent`,
                    borderBottom: `${TAIL_LENGTH_PX * 0.7}px solid transparent`,
                    transform: `translate(-50%, -50%) rotate(${(p as RemotePlacement).tailAngleDeg}deg) translate(${REMOTE_BUBBLE_OFFSET_PX * 0.4}px, 0)`,
                    transformOrigin: 'center',
                    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))',
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </>,
    document.body,
  );
};
