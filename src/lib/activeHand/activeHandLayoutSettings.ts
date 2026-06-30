/**
 * Per-game Active-Player Hand Layout policy.
 *
 * Contract:
 *   Each card game owns its own `ActiveHandLayoutPolicy` persisted as
 *   a `system_settings` row (e.g. `activeHandLayout.cribbage`). The
 *   policy governs the **resolver** that sizes the active player's
 *   hand-stage row:
 *
 *     1. Start with that game's `preferredOverlap`.
 *     2. Resolve the largest cards that fit the active-hand stage at
 *        that overlap (constrained by stage width AND height).
 *     3. If cards fall below `minCardWidthPx` at preferred overlap,
 *        progressively increase overlap up to `maxOverlap`.
 *     4. Never exceed `maxOverlap`; lock the resolved card size +
 *        overlap for the phase.
 *
 * No game-rule, no device-size hardcoding — every threshold is
 * declared here per-game and editable in Geometry Lab.
 *
 * Game registry: extend by adding a new entry to
 * `ACTIVE_HAND_LAYOUT_GAMES`. Each entry auto-registers its domain at
 * import. Future card games (e.g. ginRummy) get a row by appending.
 */

import { useSyncExternalStore } from 'react';
import {
  registerDomain,
  subscribe,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';

export interface ActiveHandLayoutPolicy {
  /** Target overlap normalized to card width. Range [0, 0.9]. */
  preferredOverlap: number;
  /** Hard ceiling overlap normalized to card width. Range [0, 0.9]. */
  maxOverlap: number;
  /** Minimum legible card width in CSS px. */
  minCardWidthPx: number;
}

export interface ActiveHandLayoutGameSpec {
  game: GameKey;
  label: string;
  /** system_settings.key */
  key: string;
  cacheKey: string;
  defaults: ActiveHandLayoutPolicy;
}

/**
 * Per-game registry. Crib + Gin are seeded; add other card games by
 * appending entries. The defaults preserve a small intentional fan and
 * a 24px readability floor — adjustable in Geometry Lab without code.
 */
export const ACTIVE_HAND_LAYOUT_GAMES: ActiveHandLayoutGameSpec[] = [
  {
    game: 'cribbage',
    label: 'Cribbage',
    key: 'activeHandLayout.cribbage',
    cacheKey: 'ptp_activeHandLayout_cribbage',
    defaults: {
      preferredOverlap: 0.07,
      maxOverlap: 0.35,
      minCardWidthPx: 28,
    },
  },
  {
    game: 'ginRummy',
    label: 'Gin Rummy',
    key: 'activeHandLayout.ginRummy',
    cacheKey: 'ptp_activeHandLayout_ginRummy',
    defaults: {
      preferredOverlap: 0.20,
      maxOverlap: 0.45,
      minCardWidthPx: 28,
    },
  },
];

function sanitizeFor(defaults: ActiveHandLayoutPolicy) {
  return (raw: unknown): ActiveHandLayoutPolicy => {
    const v = (raw ?? {}) as Partial<Record<keyof ActiveHandLayoutPolicy, unknown>>;
    const num = (x: unknown, fallback: number): number =>
      typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const preferred = Math.max(0, Math.min(0.9, num(v.preferredOverlap, defaults.preferredOverlap)));
    const max = Math.max(preferred, Math.min(0.9, num(v.maxOverlap, defaults.maxOverlap)));
    const minW = Math.max(8, Math.min(120, num(v.minCardWidthPx, defaults.minCardWidthPx)));
    return { preferredOverlap: preferred, maxOverlap: max, minCardWidthPx: minW };
  };
}

for (const spec of ACTIVE_HAND_LAYOUT_GAMES) {
  registerDomain<ActiveHandLayoutPolicy>({
    key: spec.key,
    defaults: spec.defaults,
    sanitize: sanitizeFor(spec.defaults),
    firstPaintCacheKey: spec.cacheKey,
  });
}

export function getActiveHandLayoutSpec(game: GameKey): ActiveHandLayoutGameSpec | null {
  return ACTIVE_HAND_LAYOUT_GAMES.find((s) => s.game === game) ?? null;
}

export function useActiveHandLayoutPolicy(game: GameKey): ActiveHandLayoutPolicy {
  const spec = getActiveHandLayoutSpec(game);
  return useSyncExternalStore(
    (cb) => (spec ? subscribe<ActiveHandLayoutPolicy>(spec.key, cb) : () => undefined),
    () =>
      spec
        ? getSnapshot<ActiveHandLayoutPolicy>(spec.key)
        : FALLBACK_POLICY,
    () =>
      spec
        ? getSnapshot<ActiveHandLayoutPolicy>(spec.key)
        : FALLBACK_POLICY,
  );
}

const FALLBACK_POLICY: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.07,
  maxOverlap: 0.35,
  minCardWidthPx: 28,
};

// ─── Resolver ────────────────────────────────────────────────────────────

export interface ResolvedActiveHandRow {
  cardWidth: number;
  cardHeight: number;
  overlapPx: number;
  totalWidth: number;
  /** Resolved normalized overlap actually used (after policy escalation). */
  appliedOverlap: number;
}

export function resolveActiveHandLayout(
  stage: { width: number; height: number } | null,
  capacity: number,
  policy: ActiveHandLayoutPolicy,
  aspect: number = 2 / 3,
): ResolvedActiveHandRow | null {
  if (!stage) return null;
  if (!Number.isFinite(stage.width) || stage.width <= 0) return null;
  if (!Number.isFinite(stage.height) || stage.height <= 0) return null;
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;

  const heightBound = stage.height * aspect;
  const { preferredOverlap, maxOverlap, minCardWidthPx } = policy;

  // Width that exactly fills stage.width at a given overlap.
  const widthAt = (overlap: number): number => {
    const density = 1 + (capacity - 1) * (1 - overlap);
    return density > 0 ? stage.width / density : stage.width;
  };

  // Step 1+2: largest cards that fit at preferred overlap.
  let overlap = Math.max(0, Math.min(maxOverlap, preferredOverlap));
  let cardWidth = Math.min(widthAt(overlap), heightBound);

  // Step 3: if too small at preferred, escalate overlap toward max so
  // cards regrow horizontally without violating the height bound.
  if (capacity > 1 && cardWidth < minCardWidthPx) {
    const target = Math.min(heightBound, Math.max(minCardWidthPx, cardWidth));
    // Solve overlap such that widthAt(overlap) = target.
    //   target * (1 + (N-1)(1-o)) = stage.width
    //   (1-o) = (stage.width/target - 1) / (N-1)
    const oneMinus = (stage.width / target - 1) / (capacity - 1);
    const required = 1 - Math.max(0, Math.min(1, oneMinus));
    overlap = Math.max(overlap, Math.min(maxOverlap, required));
    cardWidth = Math.min(widthAt(overlap), heightBound);
  }

  // Single-card row: no overlap is meaningful.
  if (capacity === 1) {
    cardWidth = Math.min(stage.width, heightBound);
    overlap = 0;
  }

  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return null;

  const overlapPx = cardWidth * overlap;
  const totalWidth = cardWidth + (capacity - 1) * (cardWidth - overlapPx);

  return {
    cardWidth,
    cardHeight: cardWidth / aspect,
    overlapPx,
    totalWidth,
    appliedOverlap: overlap,
  };
}
