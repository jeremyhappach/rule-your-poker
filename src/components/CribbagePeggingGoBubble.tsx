/**
 * CribbagePeggingGoBubble
 *
 * Renders a compact "Go" speech bubble anchored to each blocked player's
 * canonical chipstack ([data-chip-center="${position}"]) whenever that
 * player is in `pegging.goCalledBy` and still holds cards.
 *
 * Ownership contract:
 *   - Bubble truth is derived purely from authoritative cribbage state
 *     (`goCalledBy` + `playerStates[*].hand`). No local latch, no timer.
 *   - The bubble persists automatically for the pegging run because
 *     `goCalledBy` is reset by `beginNewPeggingRun` / `resetPeggingCount`
 *     on: 31, go/last-card award, and phase transitions.
 *   - Presentation ONLY. Legality is decided by the authoritative
 *     `advanceToNextPeggingTurn` in cribbageGameLogic.ts, which auto-adds
 *     blocked candidates to `goCalledBy` before spotlight reassignment.
 */
import { useEffect, useState } from 'react';
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

interface AnchorEntry {
  playerId: string;
  position: number;
  el: HTMLElement;
}

export const CribbagePeggingGoBubble = ({
  cribbageState,
  playerPositionById,
  isPeggingPresentation,
}: CribbagePeggingGoBubbleProps) => {
  const goCalledBy = cribbageState?.pegging.goCalledBy ?? [];
  const pendingBubbleIds = cribbageState?.pegging.pendingGoBubblePlayerIds ?? [];
  const playerStates = cribbageState?.playerStates ?? {};
  const phase = cribbageState?.phase;

  // Compute the target list of {playerId, position} pairs.
  // Union of authoritative goCalledBy (continuing-holder path) and the
  // pendingGoBubblePlayerIds latch (immediate-Go resolution path — this
  // survives the same-frame reset performed by beginNewPeggingRun so the
  // bubble renders during the go_point award).
  const targets: { playerId: string; position: number }[] = [];
  if (isPeggingPresentation && phase === 'pegging') {
    const seen = new Set<string>();
    const candidateIds = [...goCalledBy, ...pendingBubbleIds];
    for (const pid of candidateIds) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const ps = playerStates[pid];
      // For pendingBubbleIds we permit hand.length===0 (immediate Go
      // resolution can leave the blocked player with no cards). For
      // continuing goCalledBy we still require hand>0 to avoid stale
      // bubbles once a player is out.
      const isPending = pendingBubbleIds.includes(pid);
      if (!ps) continue;
      if (!isPending && ps.hand.length === 0) continue;
      const pos = playerPositionById.get(pid);
      if (pos == null) continue;
      targets.push({ playerId: pid, position: pos });
    }
  }

  // Resolve DOM anchors. We poll once per targets-signature change until
  // each anchor is present; there is no timer that controls truth or
  // lifetime — the effect is purely a DOM-availability probe.
  const [anchors, setAnchors] = useState<AnchorEntry[]>([]);
  const signature = targets.map(t => `${t.playerId}:${t.position}`).join('|');

  useEffect(() => {
    if (targets.length === 0) {
      setAnchors([]);
      return;
    }
    let cancelled = false;
    const resolve = () => {
      const next: AnchorEntry[] = [];
      for (const t of targets) {
        const el = document.querySelector(
          `[data-chip-center="${t.position}"]`,
        ) as HTMLElement | null;
        if (el) next.push({ playerId: t.playerId, position: t.position, el });
      }
      if (cancelled) return;
      setAnchors(prev => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => p.el === next[i].el && p.playerId === next[i].playerId)
        ) {
          return prev;
        }
        return next;
      });
      if (next.length < targets.length) {
        raf = requestAnimationFrame(resolve);
      }
    };
    let raf = requestAnimationFrame(resolve);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (anchors.length === 0) return null;

  return (
    <>
      {anchors.map(a =>
        createPortal(
          <div
            key={`${a.playerId}:${a.position}`}
            data-cribbage-go-bubble={a.position}
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-40"
          >
            <div className="relative flex items-center justify-center rounded-full bg-black/85 text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 shadow-md animate-in fade-in zoom-in-95 duration-200">
              Go
              {/* Speech tail pointing down toward the chipstack */}
              <span
                aria-hidden
                className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                style={{
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '4px solid rgba(0,0,0,0.85)',
                }}
              />
            </div>
          </div>,
          a.el,
        ),
      )}
    </>
  );
};
