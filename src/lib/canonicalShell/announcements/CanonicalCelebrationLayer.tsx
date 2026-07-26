/**
 * CanonicalCelebrationLayer — shell-owned celebration overlay.
 *
 * Architectural intent:
 *   - The lifecycle announcement rail (CanonicalAnnouncementLayer) is
 *     reserved for low-fidelity contextual messaging — "Awaiting ante
 *     decisions…", "Next round starting…", etc.
 *   - Celebration-tier events (match_win today; future round-tier
 *     promotions) deserve a distinct centered overlay surface and
 *     must never be downgraded into the 36px lifecycle rail.
 *
 * Ownership:
 *   - Mounted exactly once by PersistentTableShell, above the shell
 *     column, below modal/dialog z-indices.
 *   - Subscribes to the same CanonicalAnnouncementProvider context as
 *     the rail. No new event types, no game-specific emitters, no
 *     bespoke per-game overlays.
 *   - Renders when `active.type` is in CELEBRATION_TYPES and the
 *     renderer returns an overlay; otherwise returns null.
 *   - Pointer-events are captured by the overlay while active, restoring
 *     legacy terminal takeover semantics until the announcement TTL
 *     releases chip transport / replay progression.
 *
 * Observer parity:
 *   - Render is driven purely by the canonical announcement context.
 *     Observers, losers, and winners all see the celebration surface.
 *     Winner-only confetti remains the per-game caller's responsibility
 *     (e.g. Cribbage's triggerWinSequence) and is intentionally NOT
 *     duplicated here.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderCelebration } from './celebrationRenderers';
import { isCelebrationType } from './types';
import { recordAnnouncementDebugEvent } from './announcementDebugLog';
import { useEffect, useRef } from 'react';

const celebrationLayerMountCounts = new Map<string, number>();
const celebrationLayerUnmountCounts = new Map<string, number>();

export function CanonicalCelebrationLayer() {
  const ctx = useAnnouncementContext();
  const active = ctx?.active ?? null;
  const isCeleb = active ? isCelebrationType(active.type) : false;
  const node = active && isCeleb ? renderCelebration(active) : null;
  const mountedEventIdRef = useRef<string | null>(null);

  // [CRIBBAGE-DOUBLE-SKUNK-TRACE] CanonicalCelebrationLayer mount/unmount per eventId
  useEffect(() => {
    if (!active || !isCeleb || !node) {
      if (mountedEventIdRef.current) {
        const id = mountedEventIdRef.current;
        const u = (celebrationLayerUnmountCounts.get(id) ?? 0) + 1;
        celebrationLayerUnmountCounts.set(id, u);
        recordAnnouncementDebugEvent('layer-unmount', 'CRIBBAGE-DOUBLE-SKUNK-TRACE celebration unmount', {
          eventId: id,
          mountCount: celebrationLayerMountCounts.get(id) ?? 0,
          unmountCount: u,
        });
        mountedEventIdRef.current = null;
      }
      return;
    }
    if (mountedEventIdRef.current !== active.id) {
      // unmount prior if any
      if (mountedEventIdRef.current) {
        const prev = mountedEventIdRef.current;
        const u = (celebrationLayerUnmountCounts.get(prev) ?? 0) + 1;
        celebrationLayerUnmountCounts.set(prev, u);
        recordAnnouncementDebugEvent('layer-unmount', 'CRIBBAGE-DOUBLE-SKUNK-TRACE celebration unmount', {
          eventId: prev,
          mountCount: celebrationLayerMountCounts.get(prev) ?? 0,
          unmountCount: u,
        });
      }
      const m = (celebrationLayerMountCounts.get(active.id) ?? 0) + 1;
      celebrationLayerMountCounts.set(active.id, m);
      recordAnnouncementDebugEvent('layer-mount', 'CRIBBAGE-DOUBLE-SKUNK-TRACE celebration mount', {
        eventId: active.id,
        mountCount: m,
        unmountCount: celebrationLayerUnmountCounts.get(active.id) ?? 0,
        activeType: active.type,
      });
      mountedEventIdRef.current = active.id;
    }
  }, [active, isCeleb, node]);


  // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 4 — render decision
  recordAnnouncementDebugEvent('lifecycle', `CRIBBAGE-DOUBLE-SKUNK-TRACE CanonicalCelebrationLayer render decision: ${node ? 'shown' : 'null'}`, {
    activeId: active?.id ?? null,
    terminalEventId: active?.id ?? null,
    activeType: active?.type ?? null,
    isCelebrationType: isCeleb,
    nodePresent: !!node,
    skunk: (active?.payload as { skunk?: unknown } | undefined)?.skunk ?? null,
  });
  if (!ctx || !ctx.active) return null;
  if (!isCelebrationType(ctx.active.type)) return null;
  if (!node) return null;

  return (
    <div
      data-canonical-shell-celebration-layer=""
      aria-hidden={false}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Wrapper is a full-viewport flex container spanning the entire
        // shell root. Making it pointer-events:auto swallowed clicks on
        // any UI beneath it (e.g. the 3-5-7 winner "Show Cards" button
        // at y≈560), even when the actual celebration content was a
        // centered small node. Keep the wrapper transparent to pointer
        // events; celebration content opts in on its own root.
        pointerEvents: 'none',
        zIndex: 90, // above shell overlay root (80), below modal/toast layers.
      }}
    >
      {node}
    </div>
  );
}
