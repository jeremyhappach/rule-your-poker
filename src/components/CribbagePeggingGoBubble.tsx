/**
 * CribbagePeggingGoBubble
 *
 * Renders a clearly-visible white speech bubble ("Go") anchored to each
 * blocked player's canonical chipstack ([data-chip-center="${position}"]).
 * The bubble body sits INWARD from the chipstack (toward felt center),
 * with a tail pointing OUTWARD back at the chip cluster.
 *
 * Geometry contract:
 *   - Anchor: [data-chip-center="${position}"] (canonical chip cluster).
 *   - Inward direction: unit vector from chipstack center → felt-surface
 *     center ([data-canonical-felt-surface]). No per-seat magic offsets;
 *     mirrors automatically through canonical seat geometry.
 *   - Portal root: document.body. Positioned via fixed coords so the
 *     bubble is not clipped by the circular felt overflow.
 *
 * Ownership contract:
 *   - Bubble truth derives purely from authoritative cribbage state
 *     (`goCalledBy` ∪ `pendingGoBubblePlayerIds`). No local latch, no
 *     timer. See CribbagePeggingGoBubble.test.tsx.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CribbageState } from '@/lib/cribbageTypes';

interface CribbagePeggingGoBubbleProps {
  cribbageState: CribbageState | null;
  /** Maps player id → seat position (1..N) used by [data-chip-center]. */
  playerPositionById: Map<string, number>;
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
  /** Tail tip pointing back to the chipstack (viewport px). */
  tailX: number;
  tailY: number;
  /** Tail rotation in degrees (0 = tail points right / east). */
  tailAngleDeg: number;
}

const BUBBLE_OFFSET_PX = 44; // distance from chip center to bubble center (inward)
const TAIL_LENGTH_PX = 10;

export const CribbagePeggingGoBubble = ({
  cribbageState,
  playerPositionById,
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
      const ps = playerStates[pid];
      if (!ps) continue;
      const isPending = pendingBubbleIds.includes(pid);
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
      const felt = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
      const feltRect = felt?.getBoundingClientRect() ?? null;
      // Fallback to viewport center if felt not yet mounted.
      const feltCx = feltRect
        ? feltRect.left + feltRect.width / 2
        : window.innerWidth / 2;
      const feltCy = feltRect
        ? feltRect.top + feltRect.height / 2
        : window.innerHeight / 2;

      const next: Placement[] = [];
      let missing = false;
      for (const t of targets) {
        const chip = document.querySelector<HTMLElement>(
          `[data-chip-center="${t.position}"]`,
        );
        if (!chip) {
          missing = true;
          continue;
        }
        const r = chip.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = feltCx - cx;
        const dy = feltCy - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        // Bubble body sits inward from chip center.
        const bubbleX = cx + ux * BUBBLE_OFFSET_PX;
        const bubbleY = cy + uy * BUBBLE_OFFSET_PX;
        // Tail root emerges from the outward (chip-facing) side of the
        // bubble; angle points OUTWARD toward the chip (opposite of ux/uy).
        const tailAngleDeg = (Math.atan2(-uy, -ux) * 180) / Math.PI;
        next.push({
          playerId: t.playerId,
          position: t.position,
          bubbleX,
          bubbleY,
          tailX: cx,
          tailY: cy,
          tailAngleDeg,
        });
      }
      setPlacements(prev => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => {
            const n = next[i];
            return (
              p.playerId === n.playerId &&
              Math.abs(p.bubbleX - n.bubbleX) < 0.5 &&
              Math.abs(p.bubbleY - n.bubbleY) < 0.5 &&
              Math.abs(p.tailAngleDeg - n.tailAngleDeg) < 0.5
            );
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
          key={`${p.playerId}:${p.position}`}
          data-cribbage-go-bubble={p.position}
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
            {/* Tail — rotated triangle pointing outward toward chipstack. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2"
              style={{
                width: 0,
                height: 0,
                borderLeft: `${TAIL_LENGTH_PX}px solid white`,
                borderTop: `${TAIL_LENGTH_PX * 0.7}px solid transparent`,
                borderBottom: `${TAIL_LENGTH_PX * 0.7}px solid transparent`,
                transform: `translate(-50%, -50%) rotate(${p.tailAngleDeg}deg) translate(${BUBBLE_OFFSET_PX * 0.4}px, 0)`,
                transformOrigin: 'center',
                filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))',
              }}
            />
          </div>
        </div>
      ))}
    </>,
    document.body,
  );
};

// Retain unused import guard for tree-shaking cleanliness.
void useEffect;
