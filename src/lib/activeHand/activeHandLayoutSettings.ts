/**
 * Per-game Active-Player Hand Layout policy.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  CONTRACT (v2 — canonical Active Player Hand pass)
 * ─────────────────────────────────────────────────────────────────────
 *  Each card game owns its own `ActiveHandLayoutPolicy` persisted as a
 *  `system_settings` row (e.g. `activeHandLayout.cribbage`). The policy
 *  drives a SINGLE shared resolver that sizes the active player's
 *  hand-stage rect and the cards inside it. There is one and only one
 *  physical-card treatment, extracted from Holm, delivered via the
 *  shared `<ActiveHandFan/>` renderer that all four games consume.
 *
 *  Ownership boundary:
 *    - The active pane / shell owns the FULL pane rect and its lower
 *      action / instruction / identity zone. It measures the pane and
 *      renders the lower zone as a sibling of the hand.
 *    - This resolver owns the CARD STAGE only. Given a pane rect (or
 *      an explicit stage rect on legacy callers) plus the authored
 *      reserved-lower-zone % + inter-zone clearance %, it computes the
 *      stage rect and the card size / overlap / fan arch that fits it.
 *    - The shared renderer never receives or renders the lower zone.
 *
 *  Reactive path:
 *    Policies are persisted via `defaultsRegistry` (system_settings).
 *    Consumers use `useActiveHandLayoutPolicy(game)` which subscribes
 *    to the committed reactive store — Apply and remote realtime edits
 *    take effect on already-mounted active-hand consumers immediately.
 *
 *  Resolver flow (per phase):
 *    1. Measure the active pane rect (owner does this).
 *    2. Subtract `reservedLowerZonePctOfPane` and
 *       `interZoneClearancePctOfPane` from pane HEIGHT → stage height.
 *    3. Bound stage WIDTH by `maxWidthPctOfPane`, HEIGHT by
 *       `maxHeightPctOfPane`.
 *    4. Choose card width from `preferredCardScalePctOfStage` clamped
 *       by `maxCardScalePctOfStage`, capacity, and aspect (height
 *       bound). Apply `baselineOverlapPct` and `baselineFanArchDeg`.
 *    5. If containment fails, escalate overlap toward
 *       `maxAdaptiveOverlapPct` (never past). If still too small,
 *       shrink card width to fit — never below `minCardWidthPx`.
 *    6. Lock the resolved size + overlap + arch for the phase.
 *
 *  Back-compat: the legacy fields `preferredOverlap`, `maxOverlap`,
 *  and `minCardWidthPx` are preserved. `sanitize()` back-fills the
 *  new fields when only legacy values exist, and vice-versa, so
 *  existing persisted settings continue to load.
 */

import { useSyncExternalStore } from 'react';
import {
  registerDomain,
  subscribe,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';

// ─── Policy shape ───────────────────────────────────────────────────

export interface ActiveHandLayoutPolicy {
  // ── Composition (baseline) ────────────────────────────────────────
  /** Baseline overlap as a fraction of card width. [0, 0.9]. */
  preferredOverlap: number;
  /** Hard ceiling overlap as a fraction of card width. [0, 0.9]. */
  maxOverlap: number;
  /** Minimum legible card width in CSS px. [8, 120]. */
  minCardWidthPx: number;

  // ── Pane-relative sizing (v2, authored as percentages) ────────────
  /** Max usable hand-stage width as % of measured pane width. [0, 1]. */
  maxWidthPctOfPane: number;
  /** Max usable hand-stage height as % of measured pane height. [0, 1]. */
  maxHeightPctOfPane: number;
  /** % of pane height reserved for lower action/instruction/identity zone. [0, 0.9]. */
  reservedLowerZonePctOfPane: number;
  /** % of pane height as vertical clearance between hand stage and lower zone. [0, 0.5]. */
  interZoneClearancePctOfPane: number;

  // ── Card scale within resolved stage ─────────────────────────────
  /** Preferred card width as % of resolved stage width. [0, 1]. */
  preferredCardScalePctOfStage: number;
  /** Hard ceiling card width as % of resolved stage width. [0, 1]. */
  maxCardScalePctOfStage: number;

  // ── Fan composition ───────────────────────────────────────────────
  /** Baseline arch in degrees between outermost cards. [0, 45]. */
  baselineFanArchDeg: number;
  /** Baseline overlap as % of card width. Mirrors `preferredOverlap` in v2 space. */
  baselineOverlapPct: number;
  /** Ceiling overlap used only when containment requires it. Mirrors `maxOverlap`. */
  maxAdaptiveOverlapPct: number;

  // ── Stage vertical placement (v3 — active-hand host anchor) ───────
  /**
   * Extra top inset, expressed as fraction of pane HEIGHT, applied
   * BEFORE the stage rect is placed in the pane. Positive values push
   * the whole hand-stage DOWN (leaving more empty space above cards).
   * Zero preserves the legacy top-flushed placement. [0, 0.9].
   */
  stageTopInsetPctOfPane: number;
  /**
   * Vertical alignment of the fan within the resolved stage rect.
   *   'bottom' — cards flush to bottom of stage (legacy default).
   *   'center' — cards centered vertically inside stage.
   *   'top'    — cards flush to top of stage (moves hand UP inside pane).
   */
  stageVerticalAlignment: 'top' | 'center' | 'bottom';
  /**
   * Signed final Y trim as % of stage HEIGHT, applied AFTER alignment.
   * Positive shifts cards DOWN inside the stage; negative shifts UP.
   * Use for small authored trims only. [-0.5, 0.5].
   */
  contentYOffsetPctOfStage: number;
}

export interface ActiveHandLayoutGameSpec {
  game: GameKey;
  label: string;
  /** system_settings.key */
  key: string;
  cacheKey: string;
  defaults: ActiveHandLayoutPolicy;
}

// ─── Defaults (seeded from each game's existing measured layout) ────

const CRIB_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.07,
  maxOverlap: 0.35,
  minCardWidthPx: 28,
  maxWidthPctOfPane: 0.94,
  maxHeightPctOfPane: 0.62,
  reservedLowerZonePctOfPane: 0.24,
  interZoneClearancePctOfPane: 0.04,
  preferredCardScalePctOfStage: 0.18,
  maxCardScalePctOfStage: 0.24,
  baselineFanArchDeg: 6,
  baselineOverlapPct: 0.07,
  maxAdaptiveOverlapPct: 0.35,
  stageTopInsetPctOfPane: 0,
  stageVerticalAlignment: 'bottom',
  contentYOffsetPctOfStage: 0,
};

const GIN_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.20,
  maxOverlap: 0.45,
  minCardWidthPx: 28,
  maxWidthPctOfPane: 0.96,
  maxHeightPctOfPane: 0.60,
  reservedLowerZonePctOfPane: 0.22,
  interZoneClearancePctOfPane: 0.04,
  preferredCardScalePctOfStage: 0.11,
  maxCardScalePctOfStage: 0.16,
  baselineFanArchDeg: 8,
  baselineOverlapPct: 0.20,
  maxAdaptiveOverlapPct: 0.45,
  // Move Gin hand UP inside the pane: fan flush to top of stage,
  // small authored top inset for breathing room above the fan.
  stageTopInsetPctOfPane: 0.02,
  stageVerticalAlignment: 'top',
  contentYOffsetPctOfStage: 0,
};

const HOLM_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.18,
  maxOverlap: 0.42,
  minCardWidthPx: 30,
  maxWidthPctOfPane: 0.94,
  maxHeightPctOfPane: 0.64,
  reservedLowerZonePctOfPane: 0.22,
  interZoneClearancePctOfPane: 0.04,
  preferredCardScalePctOfStage: 0.28,
  maxCardScalePctOfStage: 0.36,
  baselineFanArchDeg: 8,
  baselineOverlapPct: 0.18,
  maxAdaptiveOverlapPct: 0.42,
  stageTopInsetPctOfPane: 0,
  stageVerticalAlignment: 'bottom',
  contentYOffsetPctOfStage: 0,
};

const THREE_FIVE_SEVEN_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.12,
  maxOverlap: 0.40,
  minCardWidthPx: 28,
  maxWidthPctOfPane: 0.94,
  maxHeightPctOfPane: 0.60,
  reservedLowerZonePctOfPane: 0.22,
  interZoneClearancePctOfPane: 0.04,
  preferredCardScalePctOfStage: 0.20,
  maxCardScalePctOfStage: 0.30,
  baselineFanArchDeg: 6,
  baselineOverlapPct: 0.12,
  maxAdaptiveOverlapPct: 0.40,
  stageTopInsetPctOfPane: 0,
  stageVerticalAlignment: 'bottom',
  contentYOffsetPctOfStage: 0,
};

/**
 * Per-game registry. Extend by appending an entry; the domain
 * auto-registers with the defaults registry at import time.
 */
export const ACTIVE_HAND_LAYOUT_GAMES: ActiveHandLayoutGameSpec[] = [
  {
    game: 'cribbage',
    label: 'Cribbage',
    key: 'activeHandLayout.cribbage',
    cacheKey: 'ptp_activeHandLayout_cribbage',
    defaults: CRIB_DEFAULTS,
  },
  {
    game: 'ginRummy',
    label: 'Gin Rummy',
    key: 'activeHandLayout.ginRummy',
    cacheKey: 'ptp_activeHandLayout_ginRummy',
    defaults: GIN_DEFAULTS,
  },
  {
    game: 'holm',
    label: 'Holm',
    key: 'activeHandLayout.holm',
    cacheKey: 'ptp_activeHandLayout_holm',
    defaults: HOLM_DEFAULTS,
  },
  {
    game: 'threeFiveSeven',
    label: '3-5-7',
    key: 'activeHandLayout.threeFiveSeven',
    cacheKey: 'ptp_activeHandLayout_threeFiveSeven',
    defaults: THREE_FIVE_SEVEN_DEFAULTS,
  },
];

// ─── Sanitize (back-compat) ─────────────────────────────────────────

function sanitizeFor(defaults: ActiveHandLayoutPolicy) {
  return (raw: unknown): ActiveHandLayoutPolicy => {
    const v = (raw ?? {}) as Partial<Record<keyof ActiveHandLayoutPolicy, unknown>>;
    const num = (x: unknown, fallback: number): number =>
      typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

    const preferred = clamp(num(v.preferredOverlap, defaults.preferredOverlap), 0, 0.9);
    const max = clamp(num(v.maxOverlap, defaults.maxOverlap), preferred, 0.9);
    const minW = clamp(num(v.minCardWidthPx, defaults.minCardWidthPx), 8, 120);

    // Back-compat: if the new fan-composition fields are absent, mirror
    // legacy `preferredOverlap` / `maxOverlap` into them.
    const baselineOverlap = clamp(num(v.baselineOverlapPct, preferred), 0, 0.9);
    const maxAdaptive = clamp(
      num(v.maxAdaptiveOverlapPct, max),
      baselineOverlap,
      0.9,
    );

    return {
      preferredOverlap: preferred,
      maxOverlap: max,
      minCardWidthPx: minW,
      maxWidthPctOfPane: clamp(num(v.maxWidthPctOfPane, defaults.maxWidthPctOfPane), 0.1, 1),
      maxHeightPctOfPane: clamp(num(v.maxHeightPctOfPane, defaults.maxHeightPctOfPane), 0.1, 1),
      reservedLowerZonePctOfPane: clamp(
        num(v.reservedLowerZonePctOfPane, defaults.reservedLowerZonePctOfPane),
        0,
        0.9,
      ),
      interZoneClearancePctOfPane: clamp(
        num(v.interZoneClearancePctOfPane, defaults.interZoneClearancePctOfPane),
        0,
        0.5,
      ),
      preferredCardScalePctOfStage: clamp(
        num(v.preferredCardScalePctOfStage, defaults.preferredCardScalePctOfStage),
        0.02,
        1,
      ),
      maxCardScalePctOfStage: clamp(
        num(v.maxCardScalePctOfStage, defaults.maxCardScalePctOfStage),
        0.02,
        1,
      ),
      baselineFanArchDeg: clamp(num(v.baselineFanArchDeg, defaults.baselineFanArchDeg), 0, 45),
      baselineOverlapPct: baselineOverlap,
      maxAdaptiveOverlapPct: maxAdaptive,
      stageTopInsetPctOfPane: clamp(
        num(v.stageTopInsetPctOfPane, defaults.stageTopInsetPctOfPane),
        0,
        0.9,
      ),
      stageVerticalAlignment:
        v.stageVerticalAlignment === 'top' ||
        v.stageVerticalAlignment === 'center' ||
        v.stageVerticalAlignment === 'bottom'
          ? v.stageVerticalAlignment
          : defaults.stageVerticalAlignment,
      contentYOffsetPctOfStage: clamp(
        num(v.contentYOffsetPctOfStage, defaults.contentYOffsetPctOfStage),
        -0.5,
        0.5,
      ),
    };
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

const FALLBACK_POLICY: ActiveHandLayoutPolicy = CRIB_DEFAULTS;

/**
 * Reactive per-game policy hook. Backed by the committed
 * `defaultsRegistry` store — Apply and remote realtime updates
 * propagate to consumers immediately.
 */
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

// ─── Resolver ────────────────────────────────────────────────────────

export interface ActiveHandStageRect {
  width: number;
  height: number;
}

export interface ResolvedActiveHandRow {
  /** Resolved card CSS width in px. */
  cardWidth: number;
  /** Resolved card CSS height in px (width ÷ aspect). */
  cardHeight: number;
  /** Applied overlap in px between adjacent cards. */
  overlapPx: number;
  /** Total rendered width of the fan in px. */
  totalWidth: number;
  /** Resolved normalized overlap actually used (after policy escalation). */
  appliedOverlap: number;
  /** Applied fan arch in degrees between outermost cards. */
  fanArchDeg: number;
  /** Full transformed visual bounds of the fan, including shadow allowance. */
  visualBounds: ActiveHandFanBounds;
  /** X offset applied to the untransformed row so visual bounds fit inside stage. */
  rowOffsetX: number;
  /** Y offset applied to the untransformed row so visual bounds fit inside stage. */
  rowOffsetY: number;
  /** Resolved card stage rect (owner uses this for the card container). */
  stageRect: ActiveHandStageRect;
  /** Reserved lower-zone height in px (owner renders the lower zone with this). */
  reservedLowerZonePx: number;
  /** Inter-zone clearance in px between hand stage and lower zone. */
  interZoneClearancePx: number;
  /**
   * Extra top inset in px (from `stageTopInsetPctOfPane`). The pane
   * owner should offset the stage container DOWN by this amount from
   * the pane's top edge. Cards do NOT re-scale for this value — it
   * moves the whole stage without changing card geometry.
   */
  stageTopInsetPx: number;
}

export interface ActiveHandFanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  shadowPadPx: number;
}

const ACTIVE_HAND_VISUAL_BOUNDS_PAD_PX = 8;

function transformedFanBounds(
  cardWidth: number,
  cardHeight: number,
  overlapPx: number,
  capacity: number,
  fanArchDeg: number,
  shadowPadPx: number = ACTIVE_HAND_VISUAL_BOUNDS_PAD_PX,
): ActiveHandFanBounds {
  const count = Math.max(1, Math.floor(capacity));
  const arch = count > 1 ? fanArchDeg : 0;
  const perCardDeg = count > 1 ? arch / (count - 1) : 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < count; index += 1) {
    const x = index * (cardWidth - overlapPx);
    const originX = x + cardWidth / 2;
    const originY = cardHeight;
    const deg = count > 1 ? -arch / 2 + perCardDeg * index : 0;
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners: Array<[number, number]> = [
      [x, 0],
      [x + cardWidth, 0],
      [x, cardHeight],
      [x + cardWidth, cardHeight],
    ];
    for (const [cx, cy] of corners) {
      const dx = cx - originX;
      const dy = cy - originY;
      const rx = originX + dx * cos - dy * sin;
      const ry = originY + dx * sin + dy * cos;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  const pad = Math.max(0, shadowPadPx);
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    shadowPadPx: pad,
  };
}

/**
 * Optional overrides consumed by the pane-based resolver.
 *
 * `measuredLowerZoneMinPx` is the runtime-measured minimum rendered
 * height of the sibling lower zone (action / instruction / identity)
 * that the pane owner reserves as `max-content` next to the hand
 * stage. `safeAreaBottomPx` is the resolved
 * `env(safe-area-inset-bottom)` allowance so devices with a home-bar /
 * gesture area cannot clip the identity row.
 *
 * Resolved reservation used by the resolver:
 *   `max(paneH × reservedLowerZonePctOfPane, measuredLowerZoneMinPx + safeAreaBottomPx)`
 *
 * Never falls below the authored reservation.
 */
export interface PaneReservationOverrides {
  measuredLowerZoneMinPx?: number;
  safeAreaBottomPx?: number;
}

/**
 * Compute the hand-stage rect from the pane rect + authored reservations.
 * Owners can call this to size the lower zone sibling in the same
 * space the resolver uses.
 */
export function computeStageRectFromPane(
  paneRect: ActiveHandStageRect,
  policy: ActiveHandLayoutPolicy,
  overrides?: PaneReservationOverrides,
): {
  stageRect: ActiveHandStageRect;
  reservedLowerZonePx: number;
  interZoneClearancePx: number;
  stageTopInsetPx: number;
} {
  const paneW = Math.max(0, paneRect.width);
  const paneH = Math.max(0, paneRect.height);
  const authoredReserved = paneH * policy.reservedLowerZonePctOfPane;
  const measured = Math.max(0, overrides?.measuredLowerZoneMinPx ?? 0);
  const safeArea = Math.max(0, overrides?.safeAreaBottomPx ?? 0);
  const reservedLowerZonePx = Math.max(authoredReserved, measured + safeArea);
  const interZoneClearancePx = paneH * policy.interZoneClearancePctOfPane;
  const stageTopInsetPx = Math.max(0, paneH * policy.stageTopInsetPctOfPane);
  const stageW = Math.max(0, paneW * policy.maxWidthPctOfPane);
  const stageH = Math.max(
    0,
    Math.min(
      paneH * policy.maxHeightPctOfPane,
      paneH - reservedLowerZonePx - interZoneClearancePx - stageTopInsetPx,
    ),
  );
  return {
    stageRect: { width: stageW, height: stageH },
    reservedLowerZonePx,
    interZoneClearancePx,
    stageTopInsetPx,
  };
}


/**
 * Legacy signature (accepts a pre-computed stage rect). Retained for
 * back-compat with the Cribbage stage-first mount path. New callers
 * should prefer `resolveActiveHandFromPane` below.
 */
export function resolveActiveHandLayout(
  stage: ActiveHandStageRect | null,
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
  const { preferredOverlap, maxOverlap, minCardWidthPx, maxCardScalePctOfStage } = policy;
  const fanArchDeg = policy.baselineFanArchDeg;

  const widthAt = (overlap: number): number => {
    const density = 1 + (capacity - 1) * (1 - overlap);
    return density > 0 ? stage.width / density : stage.width;
  };

  const widthBoundedByTransformedFan = (overlap: number): number => {
    const unitBounds = transformedFanBounds(
      1,
      1 / aspect,
      overlap,
      capacity,
      fanArchDeg,
      0,
    );
    const availableW = Math.max(0, stage.width - ACTIVE_HAND_VISUAL_BOUNDS_PAD_PX * 2);
    const availableH = Math.max(0, stage.height - ACTIVE_HAND_VISUAL_BOUNDS_PAD_PX * 2);
    const byW = unitBounds.width > 0 ? availableW / unitBounds.width : stage.width;
    const byH = unitBounds.height > 0 ? availableH / unitBounds.height : heightBound;
    return Math.max(0, Math.min(byW, byH));
  };

  const ceilingByScale = stage.width * maxCardScalePctOfStage;

  const preferred = Math.max(0, Math.min(maxOverlap, preferredOverlap));
  const overlapCandidates = capacity <= 1
    ? [0]
    : Array.from({ length: 13 }, (_unused, index) => {
        const t = index / 12;
        return preferred + (maxOverlap - preferred) * t;
      });

  let overlap = overlapCandidates[0] ?? preferred;
  let cardWidth = 0;
  for (const candidateOverlap of overlapCandidates) {
    const candidateWidth = Math.min(
      widthAt(candidateOverlap),
      heightBound,
      ceilingByScale,
      widthBoundedByTransformedFan(candidateOverlap),
    );
    if (
      candidateWidth > cardWidth + 0.25 ||
      (Math.abs(candidateWidth - cardWidth) <= 0.25 && candidateOverlap < overlap)
    ) {
      overlap = candidateOverlap;
      cardWidth = candidateWidth;
    }
  }

  // If the stage is tight, prefer legibility up to the point where the
  // transformed/shadowed fan would violate containment. This preserves
  // the existing minimum-width intent without allowing rotated corners or
  // active-hand shadows to clip outside the stage.
  if (capacity > 1 && cardWidth < minCardWidthPx) {
    const boundedMinimum = Math.min(
      minCardWidthPx,
      heightBound,
      ceilingByScale,
      widthBoundedByTransformedFan(overlap),
    );
    cardWidth = Math.max(cardWidth, boundedMinimum);
  }

  if (capacity === 1) {
    overlap = 0;
    cardWidth = Math.min(
      stage.width,
      heightBound,
      ceilingByScale,
      widthBoundedByTransformedFan(0),
    );
  }

  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return null;

  const overlapPx = cardWidth * overlap;
  const totalWidth = cardWidth + (capacity - 1) * (cardWidth - overlapPx);
  const cardHeight = cardWidth / aspect;
  const visualBounds = transformedFanBounds(
    cardWidth,
    cardHeight,
    overlapPx,
    capacity,
    fanArchDeg,
  );

  // Vertical placement of the fan inside the stage.
  const alignment = policy.stageVerticalAlignment;
  let rowOffsetYBase: number;
  if (alignment === 'top') {
    rowOffsetYBase = -visualBounds.minY;
  } else if (alignment === 'center') {
    rowOffsetYBase =
      (stage.height - visualBounds.height) / 2 - visualBounds.minY;
  } else {
    rowOffsetYBase = stage.height - visualBounds.maxY;
  }
  const rowOffsetY =
    rowOffsetYBase + stage.height * policy.contentYOffsetPctOfStage;

  return {
    cardWidth,
    cardHeight,
    overlapPx,
    totalWidth,
    appliedOverlap: overlap,
    fanArchDeg,
    visualBounds,
    rowOffsetX: (stage.width - visualBounds.width) / 2 - visualBounds.minX,
    rowOffsetY,
    stageRect: stage,
    reservedLowerZonePx: 0,
    interZoneClearancePx: 0,
    stageTopInsetPx: 0,
  };
}

/**
 * Preferred v2 entry point. Given a measured pane rect and a policy,
 * derives the stage rect (subtracting reserved lower zone + clearance)
 * and resolves the card row inside it in one pass.
 */
export function resolveActiveHandFromPane(
  paneRect: ActiveHandStageRect | null,
  capacity: number,
  policy: ActiveHandLayoutPolicy,
  aspect: number = 2 / 3,
  overrides?: PaneReservationOverrides,
): ResolvedActiveHandRow | null {
  if (!paneRect) return null;
  if (!Number.isFinite(paneRect.width) || paneRect.width <= 0) return null;
  if (!Number.isFinite(paneRect.height) || paneRect.height <= 0) return null;
  const { stageRect, reservedLowerZonePx, interZoneClearancePx, stageTopInsetPx } =
    computeStageRectFromPane(paneRect, policy, overrides);
  const row = resolveActiveHandLayout(stageRect, capacity, policy, aspect);
  if (!row) return null;
  return { ...row, reservedLowerZonePx, interZoneClearancePx, stageTopInsetPx };
}

