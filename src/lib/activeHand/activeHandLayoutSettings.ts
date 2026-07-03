/**
 * Per-game Active-Player Hand Layout policy.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  CONTRACT (v3 — Shell HUD row ownership boundary)
 * ─────────────────────────────────────────────────────────────────────
 *  Ownership boundary (canonical):
 *
 *      Shell HUD stack resolves rows  →  row 4 active-player pane rect
 *      is handed to ActiveHand        →  this policy resolves the CARD
 *      STAGE only inside that row-4 pane.
 *
 *  Shell HUD rows (announcement / tabs / timer / active pane /
 *  identity) are Shell HUD Stack territory. The timer reservation and
 *  the identity/action reservation are independent shell rows. This
 *  policy MUST NOT own, tune, subtract, or semantically reference any
 *  of them — "pane" in every field on this policy means the final
 *  ROW-4 active-player pane rect the shell has already resolved.
 *
 *  Any subtraction of a sibling action/instruction strip is performed
 *  upstream by the shell-owned pane owner BEFORE the pane rect reaches
 *  this policy; the resolver here treats its input rect as the exact
 *  usable card region.
 *
 *  Resolver flow (per phase):
 *    1. Owner hands in the resolved row-4 pane rect.
 *    2. Bound stage WIDTH by `maxWidthPctOfPane`, HEIGHT by
 *       `maxHeightPctOfPane`.
 *    3. Apply `stageTopInsetPctOfPane` — pushes the whole stage DOWN
 *       inside the pane. Cards do not re-scale for this offset.
 *    4. Choose card width from `preferredCardScalePctOfStage` clamped
 *       by `maxCardScalePctOfStage`, capacity, and aspect (height
 *       bound). Apply `baselineOverlapPct` and `baselineFanArchDeg`.
 *    5. If containment fails, escalate overlap toward
 *       `maxAdaptiveOverlapPct` (never past). If still too small,
 *       shrink card width to fit — never below `minCardWidthPx`.
 *    6. Align the resolved fan inside the stage per
 *       `stageVerticalAlignment` + `contentYOffsetPctOfStage`.
 *
 *  Reactive path: policies persist via `defaultsRegistry`
 *  (system_settings). Consumers use `useActiveHandLayoutPolicy(game)`
 *  which subscribes to the committed reactive store — Apply and remote
 *  realtime edits take effect on already-mounted consumers immediately.
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

  // ── Pane-relative sizing (v3, authored as percentages) ────────────
  /** Max usable hand-stage width as % of row-4 pane width. [0, 1]. */
  maxWidthPctOfPane: number;
  /** Max usable hand-stage height as % of row-4 pane height. [0, 1]. */
  maxHeightPctOfPane: number;

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

  // ── Stage vertical placement (v3 — inside row-4 pane only) ────────
  /**
   * Safe vertical breathing room inside the row-4 pane BELOW the row-3
   * timer-row boundary, expressed as fraction of row-4 pane HEIGHT.
   * This is NOT ownership of row 3 or timer sizing — the shell already
   * owns the timer row height. Positive values push the whole
   * hand-stage DOWN inside row 4. [0, 0.9].
   */
  stageTopInsetPctOfPane: number;
  /**
   * Safe vertical breathing room inside the row-4 pane ABOVE the row-5
   * identity/action-row boundary, expressed as fraction of row-4 pane
   * HEIGHT. This is NOT ownership of row 5 sizing — the shell owns the
   * identity/action row height. Positive values shrink the stage from
   * the bottom of row 4. [0, 0.9].
   */
  stageBottomInsetPctOfPane: number;
  /**
   * Vertical alignment of the fan within the remaining row-4 stage
   * after top+bottom clearances are applied.
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
  preferredCardScalePctOfStage: 0.18,
  maxCardScalePctOfStage: 0.24,
  baselineFanArchDeg: 6,
  baselineOverlapPct: 0.07,
  maxAdaptiveOverlapPct: 0.35,
  stageTopInsetPctOfPane: 0,
  stageBottomInsetPctOfPane: 0.28,
  stageVerticalAlignment: 'bottom',
  contentYOffsetPctOfStage: 0,
};

const GIN_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.10,
  maxOverlap: 0.35,
  minCardWidthPx: 28,
  maxWidthPctOfPane: 0.98,
  maxHeightPctOfPane: 0.60,
  preferredCardScalePctOfStage: 0.11,
  maxCardScalePctOfStage: 0.16,
  baselineFanArchDeg: 8,
  baselineOverlapPct: 0.10,
  maxAdaptiveOverlapPct: 0.35,
  // Small breathing room under the row-3 timer boundary; fan flush to
  // top of the resulting stage so the hand sits high inside row 4.
  stageTopInsetPctOfPane: 0.02,
  stageBottomInsetPctOfPane: 0.26,
  stageVerticalAlignment: 'top',
  contentYOffsetPctOfStage: 0,
};

const HOLM_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.18,
  maxOverlap: 0.42,
  minCardWidthPx: 30,
  maxWidthPctOfPane: 0.94,
  maxHeightPctOfPane: 0.64,
  preferredCardScalePctOfStage: 0.28,
  maxCardScalePctOfStage: 0.36,
  baselineFanArchDeg: 8,
  baselineOverlapPct: 0.18,
  maxAdaptiveOverlapPct: 0.42,
  stageTopInsetPctOfPane: 0,
  stageBottomInsetPctOfPane: 0.26,
  stageVerticalAlignment: 'bottom',
  contentYOffsetPctOfStage: 0,
};

const THREE_FIVE_SEVEN_DEFAULTS: ActiveHandLayoutPolicy = {
  preferredOverlap: 0.12,
  maxOverlap: 0.40,
  minCardWidthPx: 28,
  maxWidthPctOfPane: 0.94,
  maxHeightPctOfPane: 0.60,
  preferredCardScalePctOfStage: 0.20,
  maxCardScalePctOfStage: 0.30,
  baselineFanArchDeg: 6,
  baselineOverlapPct: 0.12,
  maxAdaptiveOverlapPct: 0.40,
  stageTopInsetPctOfPane: 0,
  stageBottomInsetPctOfPane: 0.26,
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
      stageBottomInsetPctOfPane: clamp(
        num(v.stageBottomInsetPctOfPane, defaults.stageBottomInsetPctOfPane),
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
  /**
   * Top clearance in px (from `stageTopInsetPctOfPane`) — safe
   * breathing room inside row 4 below the row-3 timer boundary. The
   * pane owner should offset the stage container DOWN by this amount
   * from the row-4 pane's top edge. Cards do NOT re-scale for this
   * value — it moves the whole stage without changing card geometry.
   */
  stageTopInsetPx: number;
  /**
   * Bottom clearance in px (from `stageBottomInsetPctOfPane`) — safe
   * breathing room inside row 4 above the row-5 identity/action row
   * boundary. Cards do NOT re-scale for this value; the resolver
   * simply excludes it from the stage height.
   */
  stageBottomInsetPx: number;
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
 * @deprecated Retained as a no-op type for back-compat with old
 * callers. The v3 contract removes lower-zone reservation ownership
 * from `ActiveHandLayoutPolicy`; the shell HUD stack sizes rows 3 and
 * 5 independently, and the row-4 pane rect handed to ActiveHand is
 * already the final active-player pane. Fields on this interface are
 * ignored by the resolver.
 */
export interface PaneReservationOverrides {
  measuredLowerZoneMinPx?: number;
  safeAreaBottomPx?: number;
}

/**
 * Compute the hand-stage rect inside the row-4 pane rect.
 *
 * Contract: `paneRect` MUST be the final HUD row-4 active-player pane
 * rect the shell has already resolved. The resolver never subtracts
 * timer, identity, or action reservations here — those are shell HUD
 * stack geometry and are already excluded from the pane rect handed
 * in. Only the authored intra-row breathing rooms
 * (`stageTopInsetPctOfPane`, `stageBottomInsetPctOfPane`) are applied.
 */
export function computeStageRectFromPane(
  paneRect: ActiveHandStageRect,
  policy: ActiveHandLayoutPolicy,
  overrides?: PaneReservationOverrides,
): {
  stageRect: ActiveHandStageRect;
  stageTopInsetPx: number;
  stageBottomInsetPx: number;
} {
  const paneW = Math.max(0, paneRect.width);
  const paneH = Math.max(0, paneRect.height);
  const stageTopInsetPx = Math.max(0, paneH * policy.stageTopInsetPctOfPane);
  // Bottom clearance: authored % OR measured in-pane row-5 controls +
  // safe-area, whichever is greater. This is the row-4/row-5 non-overlap
  // guard: an active-hand stage cannot consume vertical space required
  // by visible row-5 action controls that live inside the same row-4
  // pane container.
  const authoredBottomInsetPx = paneH * policy.stageBottomInsetPctOfPane;
  const measuredBottomInsetPx =
    Math.max(0, overrides?.measuredLowerZoneMinPx ?? 0) +
    Math.max(0, overrides?.safeAreaBottomPx ?? 0);
  const stageBottomInsetPx = Math.max(0, authoredBottomInsetPx, measuredBottomInsetPx);
  const stageW = Math.max(0, paneW * policy.maxWidthPctOfPane);
  const stageH = Math.max(
    0,
    Math.min(
      paneH * policy.maxHeightPctOfPane,
      paneH - stageTopInsetPx - stageBottomInsetPx,
    ),
  );
  return {
    stageRect: { width: stageW, height: stageH },
    stageTopInsetPx,
    stageBottomInsetPx,
  };
}



/**
 * Legacy signature (accepts a pre-computed stage rect). Retained for
 * back-compat with the Cribbage stage-first mount path. Card scale in
 * this signature is resolved against `stage.width` when no explicit
 * `scaleBaseWidth` is provided. New callers should prefer
 * `resolveActiveHandFromPane`, which sizes cards against the pane
 * width so `maxWidthPctOfPane` governs only the fan span.
 */
export function resolveActiveHandLayout(
  stage: ActiveHandStageRect | null,
  capacity: number,
  policy: ActiveHandLayoutPolicy,
  aspect: number = 2 / 3,
  scaleBaseWidth?: number,
): ResolvedActiveHandRow | null {
  if (!stage) return null;
  if (!Number.isFinite(stage.width) || stage.width <= 0) return null;
  if (!Number.isFinite(stage.height) || stage.height <= 0) return null;
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;

  const scaleBase =
    Number.isFinite(scaleBaseWidth) && (scaleBaseWidth as number) > 0
      ? (scaleBaseWidth as number)
      : stage.width;

  const {
    preferredOverlap,
    maxOverlap,
    minCardWidthPx,
    preferredCardScalePctOfStage,
    maxCardScalePctOfStage,
  } = policy;
  const fanArchDeg = policy.baselineFanArchDeg;

  // Step 1 — card scale is independent of the fan span. Resolved from
  // `scaleBase` (pane width) up to the height ceiling. Shrinking the
  // authored `maxWidthPctOfPane` does NOT shrink cards.
  const heightBound = stage.height * aspect;
  const maxCardWidthByScale = scaleBase * maxCardScalePctOfStage;
  const preferredCardWidth = Math.min(
    scaleBase * preferredCardScalePctOfStage,
    maxCardWidthByScale,
    heightBound,
  );
  let cardWidth = Math.max(minCardWidthPx, preferredCardWidth);
  if (cardWidth > heightBound) cardWidth = Math.max(1, heightBound);

  // Step 2 — the target fan span IS `stage.width` (governed by
  // `maxWidthPctOfPane`). Overlap is solved so the fan spans it.
  const targetFanSpan = stage.width;

  let overlapPx: number;
  let overlapRatio: number;

  if (capacity <= 1) {
    overlapPx = 0;
    overlapRatio = 0;
  } else {
    const preferredOverlapPx = cardWidth * preferredOverlap;
    const maxOverlapPx = cardWidth * maxOverlap;
    // Overlap required for `capacity` cards of `cardWidth` to fit within
    // the target fan span.
    const requiredOverlapPx =
      (capacity * cardWidth - targetFanSpan) / (capacity - 1);

    // Relax overlap only down to the authored preferred; escalate up
    // only to the max-overlap safety ceiling.
    overlapPx = Math.max(preferredOverlapPx, requiredOverlapPx);

    if (overlapPx > maxOverlapPx) {
      // Even at max overlap the fan overflows — shrink card width so
      // the fan exactly fills targetFanSpan at max overlap. This is
      // the only path that reduces card size below its authored scale.
      const denom = capacity - (capacity - 1) * maxOverlap;
      const shrunk = denom > 0 ? targetFanSpan / denom : cardWidth;
      cardWidth = Math.max(minCardWidthPx, Math.min(cardWidth, shrunk));
      overlapPx = cardWidth * maxOverlap;
      overlapRatio = maxOverlap;
    } else {
      overlapRatio = cardWidth > 0 ? overlapPx / cardWidth : 0;
    }
  }

  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return null;

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
    appliedOverlap: overlapRatio,
    fanArchDeg,
    visualBounds,
    rowOffsetX: (stage.width - visualBounds.width) / 2 - visualBounds.minX,
    rowOffsetY,
    stageRect: stage,
    stageTopInsetPx: 0,
    stageBottomInsetPx: 0,
  };
}

/**
 * Preferred v3 entry point. Given the HUD row-4 pane rect and a policy,
 * derives the stage rect (applying authored intra-row clearances) and
 * resolves the card row. Card scale is derived from the PANE width, so
 * `maxWidthPctOfPane` tunes the fan span (via overlap) rather than
 * uniformly re-scaling cards.
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
  const { stageRect, stageTopInsetPx, stageBottomInsetPx } =
    computeStageRectFromPane(paneRect, policy, overrides);
  const row = resolveActiveHandLayout(
    stageRect,
    capacity,
    policy,
    aspect,
    paneRect.width,
  );
  if (!row) return null;
  return { ...row, stageTopInsetPx, stageBottomInsetPx };
}


