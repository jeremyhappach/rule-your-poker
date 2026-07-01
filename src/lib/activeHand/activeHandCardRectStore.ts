/**
 * activeHandCardRectStore — publishes the resolved active-hand card
 * geometry (width × height) for the currently-committed phase-locked
 * layout of a given game.
 *
 * Contract:
 *   - `ActiveHandFan` publishes its resolved `{ cardWidthPx, cardHeightPx }`
 *     as soon as `resolveActiveHandLayout` returns a nonzero layout for
 *     the current pane/stage. It re-publishes only when those numbers
 *     actually change (>=0.5 px delta).
 *   - Deal orchestrators / transport-destination anchors subscribe via
 *     `useActiveHandCardRect(game)` and size their landing anchors
 *     accordingly. `resolveCardEndpoint` reads `w` / `h` from the
 *     anchor's bounding rect, and the transport runtime consumes those
 *     values as the flying-card size — so the flight lands directly on
 *     the exact final rendered card rect (no post-settle size snap).
 *
 * This is deliberately game-keyed only (not per-player). The active
 * hand is single-owner for the local viewer at any moment, and every
 * consumer subscribing to a given `GameKey` reads the same committed
 * value.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';

export interface ActiveHandCardRect {
  cardWidthPx: number;
  cardHeightPx: number;
  publishedAt: number;
  activeHandFanRenderKey?: string | null;
}

type Listener = () => void;

const rects: Map<GameKey, ActiveHandCardRect> = new Map();
const listeners: Map<GameKey, Set<Listener>> = new Map();

function notify(game: GameKey) {
  const set = listeners.get(game);
  if (!set) return;
  set.forEach((cb) => {
    try {
      cb();
    } catch {
      /* noop */
    }
  });
}

export function getActiveHandCardRect(game: GameKey): ActiveHandCardRect | null {
  return rects.get(game) ?? null;
}

export function publishActiveHandCardRect(
  game: GameKey,
  rect: ActiveHandCardRect | null,
): void {
  const prev = rects.get(game) ?? null;
  if (rect == null) {
    if (prev == null) return;
    rects.delete(game);
    notify(game);
    return;
  }
  if (
    prev &&
    Math.abs(prev.cardWidthPx - rect.cardWidthPx) < 0.5 &&
    Math.abs(prev.cardHeightPx - rect.cardHeightPx) < 0.5 &&
    (prev.activeHandFanRenderKey ?? null) === (rect.activeHandFanRenderKey ?? null)
  ) {
    return;
  }
  rects.set(game, {
    cardWidthPx: rect.cardWidthPx,
    cardHeightPx: rect.cardHeightPx,
    publishedAt: rect.publishedAt,
    activeHandFanRenderKey: rect.activeHandFanRenderKey ?? null,
  });
  notify(game);
}

export function subscribeActiveHandCardRect(game: GameKey, cb: Listener): () => void {
  let set = listeners.get(game);
  if (!set) {
    set = new Set();
    listeners.set(game, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listeners.delete(game);
  };
}

/**
 * React hook — subscribes to the committed active-hand card rect for a
 * given game. Returns `null` until the fan publishes its first layout.
 */
export function useActiveHandCardRect(game: GameKey): ActiveHandCardRect | null {
  return useSyncExternalStore(
    (cb) => subscribeActiveHandCardRect(game, cb),
    () => getActiveHandCardRect(game),
    () => null,
  );
}

/**
 * Effect helper for publishers. Publishes on mount / change and clears
 * the entry on unmount so a stale layout can never bleed across phase
 * boundaries.
 */
export function useActiveHandCardRectPublisher(
  game: GameKey,
  rect: ActiveHandCardRect | null,
): void {
  useEffect(() => {
    publishActiveHandCardRect(game, rect);
    return () => {
      // Only clear if we still own the current entry.
      const current = getActiveHandCardRect(game);
      if (
        current &&
        rect &&
        Math.abs(current.cardWidthPx - rect.cardWidthPx) < 0.5 &&
        Math.abs(current.cardHeightPx - rect.cardHeightPx) < 0.5
      ) {
        publishActiveHandCardRect(game, null);
      }
    };
  }, [game, rect?.cardWidthPx, rect?.cardHeightPx]);
}
