/**
 * Holm Showdown Geometry — clean baseline (v4 contract, single round).
 *
 * Mirrors the FINAL 3-5-7 v4 contract (no legacy bridge, no per-round
 * R1/R2/R3, no secondary group — Holm reveals a single flat exposed
 * row of "stayed" players' cards below their canonical chip discs):
 *
 *   1. CARD GEOMETRY (intrinsic) — fixed-px OR responsive (% felt vmin)
 *   2. ROW GEOMETRY (intra-row) — overlap fraction + total fan degrees
 *      + fan arch orientation (rotation-only, never affects pin/sprawl)
 *   3. SEAT/FELT PLACEMENT (extrinsic, shared) — attachment +
 *      sprawl direction + felt-relative X/Y offset
 *
 * Scope: consumed ONLY by the Holm opponent-exposed showdown render
 * path. Non-showdown Holm callers (card backs, lone-player tabled
 * cards, Chucky stage, community row, pot) are NOT affected.
 */

import {
  registerDomain,
  useDomainSnapshot,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';

// ─── Types (v4-shape, single round) ──────────────────────────────────────

export type SizingMode = 'fixed' | 'responsive';

export interface CardGeometryFixed {
  mode: 'fixed';
  cardWidthPx: number;
  aspectRatio: number;
}
export interface CardGeometryResponsive {
  mode: 'responsive';
  cardWidthPctOfFeltVmin: number;
  aspectRatio: number;
}
export type CardGeometry = CardGeometryFixed | CardGeometryResponsive;

export type FanArch = 'outward' | 'inward';

export interface RowGeometry {
  /** 0..1, fraction of card width hidden by next card. */
  overlap: number;
  /** Total degrees from first to last card. 0 = flat. */
  fanDegrees: number;
  /** Curvature/bow orientation. Rotation-only — never affects pin
   *  selection or row extension direction. */
  fanArch: FanArch;
}

export type ShowdownAttachment = 'chip-centered' | 'inner-edge' | 'outer-edge';
export type SprawlDirection = 'inward' | 'outward';

export interface OpponentShowdownPlacement {
  attachment: ShowdownAttachment;
  sprawlDirection: SprawlDirection;
  /** % of canonical felt WIDTH. +X = inward toward felt center. */
  xPctOfFelt: number;
  /** % of canonical felt HEIGHT. +Y = downward. */
  yPctOfFelt: number;
}

export interface HolmShowdownRulesState {
  placement: OpponentShowdownPlacement;
  card: CardGeometry;
  row: RowGeometry;
}

// ─── Clean-baseline defaults ─────────────────────────────────────────────

export const DEFAULT_HOLM_SHOWDOWN_RULES: HolmShowdownRulesState = {
  placement: {
    attachment: 'chip-centered',
    sprawlDirection: 'inward',
    xPctOfFelt: 0,
    yPctOfFelt: 0,
  },
  card: {
    mode: 'responsive',
    cardWidthPctOfFeltVmin: 11,
    aspectRatio: 1.4,
  },
  row: {
    overlap: 0.55,
    fanDegrees: 0,
    fanArch: 'outward',
  },
};

// ─── Persistence keys ────────────────────────────────────────────────────

export const HOLM_SHOWDOWN_RULES_STORAGE_KEY =
  'geometryLab.holm.showdownRules.opponentExposedCards.v4';
export const HOLM_SHOWDOWN_RULES_DOMAIN_KEY = 'holm_showdown_rules';

// ─── Sanitize ────────────────────────────────────────────────────────────

function sanitizeCard(raw: unknown, fb: CardGeometry): CardGeometry {
  const r = (raw ?? {}) as {
    mode?: SizingMode;
    cardWidthPx?: number;
    cardWidthPctOfFeltVmin?: number;
    aspectRatio?: number;
  };
  const aspectRatio =
    typeof r.aspectRatio === 'number' && r.aspectRatio > 0
      ? r.aspectRatio
      : fb.aspectRatio;
  if (r.mode === 'responsive') {
    return {
      mode: 'responsive',
      cardWidthPctOfFeltVmin:
        typeof r.cardWidthPctOfFeltVmin === 'number'
          ? r.cardWidthPctOfFeltVmin
          : fb.mode === 'responsive'
          ? fb.cardWidthPctOfFeltVmin
          : 11,
      aspectRatio,
    };
  }
  if (r.mode === 'fixed') {
    return {
      mode: 'fixed',
      cardWidthPx:
        typeof r.cardWidthPx === 'number' && r.cardWidthPx > 0
          ? r.cardWidthPx
          : fb.mode === 'fixed'
          ? fb.cardWidthPx
          : 40,
      aspectRatio,
    };
  }
  return fb;
}

function sanitizeRow(raw: unknown, fb: RowGeometry): RowGeometry {
  const r = (raw ?? {}) as Partial<RowGeometry> & { fanDirection?: FanArch };
  const archRaw = r.fanArch ?? r.fanDirection;
  return {
    overlap: typeof r.overlap === 'number' ? r.overlap : fb.overlap,
    fanDegrees:
      typeof r.fanDegrees === 'number' ? r.fanDegrees : fb.fanDegrees,
    fanArch:
      archRaw === 'outward' || archRaw === 'inward' ? archRaw : fb.fanArch,
  };
}

function sanitizePlacement(
  raw: unknown,
  fb: OpponentShowdownPlacement,
): OpponentShowdownPlacement {
  const r = (raw ?? {}) as Partial<OpponentShowdownPlacement>;
  const a = r.attachment;
  const s = r.sprawlDirection;
  return {
    attachment:
      a === 'outer-edge' || a === 'inner-edge' || a === 'chip-centered'
        ? a
        : fb.attachment,
    sprawlDirection:
      s === 'inward' || s === 'outward' ? s : fb.sprawlDirection,
    xPctOfFelt:
      typeof r.xPctOfFelt === 'number' ? r.xPctOfFelt : fb.xPctOfFelt,
    yPctOfFelt:
      typeof r.yPctOfFelt === 'number' ? r.yPctOfFelt : fb.yPctOfFelt,
  };
}

function sanitizeHolmShowdownRules(raw: unknown): HolmShowdownRulesState {
  const parsed = (raw ?? {}) as Partial<HolmShowdownRulesState>;
  const fb = DEFAULT_HOLM_SHOWDOWN_RULES;
  return {
    placement: sanitizePlacement(parsed.placement, fb.placement),
    card: sanitizeCard(parsed.card, fb.card),
    row: sanitizeRow(parsed.row, fb.row),
  };
}

// ─── Registry hookup ─────────────────────────────────────────────────────

registerDomain<HolmShowdownRulesState>({
  key: HOLM_SHOWDOWN_RULES_DOMAIN_KEY,
  defaults: DEFAULT_HOLM_SHOWDOWN_RULES,
  sanitize: sanitizeHolmShowdownRules,
  firstPaintCacheKey: HOLM_SHOWDOWN_RULES_STORAGE_KEY,
});

export function loadHolmShowdownRules(): HolmShowdownRulesState {
  try {
    return getSnapshot<HolmShowdownRulesState>(HOLM_SHOWDOWN_RULES_DOMAIN_KEY);
  } catch {
    return DEFAULT_HOLM_SHOWDOWN_RULES;
  }
}

export function useHolmShowdownConfig(): HolmShowdownRulesState {
  return useDomainSnapshot<HolmShowdownRulesState>(
    HOLM_SHOWDOWN_RULES_DOMAIN_KEY,
  );
}

// ─── Resolution ──────────────────────────────────────────────────────────

export interface ResolvedHolmShowdownRules {
  placement: OpponentShowdownPlacement;
  cardWidthPx: number;
  cardHeightPx: number;
  overlapPx: number;
  fanDegrees: number;
  fanArch: FanArch;
}

export const MIN_CARD_WIDTH_PX = 12;
export const MAX_CARD_WIDTH_PX = 240;
const RESPONSIVE_FALLBACK_WIDTH_PX = 40;

function resolveCardPx(
  card: CardGeometry,
  feltVminPx: number,
): { w: number; h: number } {
  let w: number;
  if (card.mode === 'fixed') {
    w = card.cardWidthPx;
  } else {
    const felt = Number.isFinite(feltVminPx) && feltVminPx > 0 ? feltVminPx : 0;
    w =
      felt > 0
        ? (card.cardWidthPctOfFeltVmin / 100) * felt
        : RESPONSIVE_FALLBACK_WIDTH_PX;
  }
  if (!Number.isFinite(w) || w <= 0) w = RESPONSIVE_FALLBACK_WIDTH_PX;
  w = Math.min(MAX_CARD_WIDTH_PX, Math.max(MIN_CARD_WIDTH_PX, w));
  return { w, h: w * card.aspectRatio };
}

export function resolveHolmShowdownRules(
  state: HolmShowdownRulesState,
  feltVminPx: number,
): ResolvedHolmShowdownRules {
  const { w, h } = resolveCardPx(state.card, feltVminPx);
  return {
    placement: state.placement,
    cardWidthPx: w,
    cardHeightPx: h,
    overlapPx: state.row.overlap * w,
    fanDegrees: state.row.fanDegrees,
    fanArch: state.row.fanArch,
  };
}

export function fanRotationDeg(
  totalDegrees: number,
  index: number,
  count: number,
): number {
  if (count <= 1) return 0;
  const step = totalDegrees / (count - 1);
  return step * (index - (count - 1) / 2);
}
