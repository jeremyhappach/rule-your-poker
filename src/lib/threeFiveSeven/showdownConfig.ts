/**
 * 3-5-7 Showdown Geometry — v4 (clean-slate, opponent-exposed only).
 *
 * Three orthogonal coordinate groups. No legacy bridge, no parity
 * guarantee with prior versions, no breakpoint table, no dynamic
 * resolver, no per-breakpoint px tiers.
 *
 *   1. CARD GEOMETRY (intrinsic)
 *      - Mutually exclusive sizing modes:
 *          fixed       → cardWidthPx (intrinsic px),    height = w * aspectRatio
 *          responsive  → cardWidthPctOfFeltVmin,         height = w * aspectRatio
 *
 *   2. ROW GEOMETRY (intra-row)
 *      - overlap     : 0..1, fraction of one card width hidden by the
 *                      next card (e.g. 0.35 = 35% covered).
 *      - fanDegrees  : TOTAL rotation spread from first to last
 *                      main-row card (0° = flat row). Per-card step is
 *                      `fanDegrees / max(1, n - 1)`.
 *
 *   3. SEAT/FELT PLACEMENT (extrinsic, shared across R1/R2/R3)
 *      - attachment  : 'chip-centered' | 'outer-edge' (auto-mirrored L/R)
 *      - xPctOfFelt  : signed %, +X = INWARD toward felt center (sign
 *                      flipped per side internally by the seat cluster).
 *      - yPctOfFelt  : signed %, +Y = downward (both sides).
 *
 *   R3-only SECONDARY GROUP — for the two non-scoring R3 cards.
 *      - visibility       : 'hidden' | 'dimmed' | 'face-down'
 *      - placement        : 'above' | 'below' | 'left' | 'right'
 *      - offsetPrimaryPct : along placement axis, % of main-row extent
 *      - offsetCrossPct   : perpendicular drift, % of main-row extent
 *      - scale / opacity / grayscale
 *
 *      Card-reveal/face state remains AUTHORITATIVELY GAME-RULE-OWNED.
 *      `secondary.visibility = 'face-down'` only restyles cards already
 *      classified by game rules as the R3 irrelevant secondary group.
 *
 * Scope: This module is consumed ONLY by the 3-5-7 opponent-exposed
 * showdown render path. PlayerHand's self/active and non-3-5-7
 * branches do not read v4 — they keep their legacy Tailwind/static
 * behavior.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type SizingMode = 'fixed' | 'responsive';

export interface CardGeometryFixed {
  mode: 'fixed';
  cardWidthPx: number;
  aspectRatio: number; // height = width * aspectRatio
}
export interface CardGeometryResponsive {
  mode: 'responsive';
  cardWidthPctOfFeltVmin: number;
  aspectRatio: number;
}
export type CardGeometry = CardGeometryFixed | CardGeometryResponsive;

export type FanDirection = 'outward' | 'inward';

export interface RowGeometry {
  /** 0..1, fraction of card width hidden by next card. */
  overlap: number;
  /** Total degrees from first to last card. 0 = flat. */
  fanDegrees: number;
  /**
   * Curvature/bow orientation of the row arc.
   *   'outward' — arc bows AWAY from felt center
   *   'inward'  — arc bows TOWARD felt center
   * 0° fanDegrees → no visible difference. Logical card order is
   * never reversed; only the bow direction changes.
   */
  fanDirection: FanDirection;
}


export interface SecondaryGroupGeometry {
  visibility: 'hidden' | 'dimmed' | 'face-down';
  placement: 'above' | 'below' | 'left' | 'right';
  /** Along placement axis, % of main-row extent. */
  offsetPrimaryPct: number;
  /** Perpendicular drift, % of main-row extent. */
  offsetCrossPct: number;
  scale: number;     // 0..N, relative to main-card size
  opacity: number;   // 0..1
  grayscale: number; // 0..1
}

export type ShowdownAttachment = 'chip-centered' | 'inner-edge' | 'outer-edge';

export interface OpponentShowdownPlacement {
  /**
   *   'chip-centered' — row centered on chip
   *   'outer-edge'    — row extends AWAY from felt center
   *                     (left seat → leftward, right seat → rightward)
   *   'inner-edge'    — row extends TOWARD felt center
   *                     (left seat → rightward, right seat → leftward)
   */
  attachment: ShowdownAttachment;
  /** % of canonical felt WIDTH. +X = inward toward felt center. */
  xPctOfFelt: number;
  /** % of canonical felt HEIGHT. +Y = downward. */
  yPctOfFelt: number;
}


export interface RoundGeometry {
  card: CardGeometry;
  row: RowGeometry;
}
export interface RoundGeometryR3 extends RoundGeometry {
  secondary: SecondaryGroupGeometry;
}

export interface ShowdownRulesState {
  placement: OpponentShowdownPlacement; // shared R1/R2/R3
  rounds: {
    r1: RoundGeometry;
    r2: RoundGeometry;
    r3: RoundGeometryR3;
  };
}

// ─── Seeds (rough; tuned in pause harness) ────────────────────────────────

export const DEFAULT_SHOWDOWN_RULES: ShowdownRulesState = {
  placement: { attachment: 'chip-centered', xPctOfFelt: 0, yPctOfFelt: 0 },
  rounds: {
    r1: {
      card: { mode: 'fixed', cardWidthPx: 40, aspectRatio: 1.4 },
      row: { overlap: 0.35, fanDegrees: 0 },
    },
    r2: {
      card: { mode: 'fixed', cardWidthPx: 44, aspectRatio: 1.4 },
      row: { overlap: 0.35, fanDegrees: 0 },
    },
    r3: {
      card: { mode: 'fixed', cardWidthPx: 48, aspectRatio: 1.4 },
      row: { overlap: 0.35, fanDegrees: 0 },
      secondary: {
        visibility: 'dimmed',
        placement: 'below',
        offsetPrimaryPct: 10,
        offsetCrossPct: 0,
        scale: 0.75,
        opacity: 0.6,
        grayscale: 0.4,
      },
    },
  },
};

// ─── Persistence keys ─────────────────────────────────────────────────────

export const SHOWDOWN_RULES_STORAGE_KEY =
  'geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v4';
export const SHOWDOWN_RULES_DOMAIN_KEY = 'three_five_seven_showdown_rules';

// ─── Sanitize ─────────────────────────────────────────────────────────────

function sanitizeCard(raw: unknown, fallback: CardGeometry): CardGeometry {
  const r = (raw ?? {}) as {
    mode?: SizingMode;
    cardWidthPx?: number;
    cardWidthPctOfFeltVmin?: number;
    aspectRatio?: number;
  };
  const aspectRatio =
    typeof r.aspectRatio === 'number' && r.aspectRatio > 0
      ? r.aspectRatio
      : fallback.aspectRatio;
  if (r.mode === 'responsive') {
    return {
      mode: 'responsive',
      cardWidthPctOfFeltVmin:
        typeof r.cardWidthPctOfFeltVmin === 'number'
          ? r.cardWidthPctOfFeltVmin
          : fallback.mode === 'responsive'
          ? fallback.cardWidthPctOfFeltVmin
          : 14,
      aspectRatio,
    };
  }
  return {
    mode: 'fixed',
    cardWidthPx:
      typeof r.cardWidthPx === 'number' && r.cardWidthPx > 0
        ? r.cardWidthPx
        : fallback.mode === 'fixed'
        ? fallback.cardWidthPx
        : 40,
    aspectRatio,
  };
}

function sanitizeRow(raw: unknown, fallback: RowGeometry): RowGeometry {
  const r = (raw ?? {}) as Partial<RowGeometry>;
  return {
    overlap: typeof r.overlap === 'number' ? r.overlap : fallback.overlap,
    fanDegrees:
      typeof r.fanDegrees === 'number' ? r.fanDegrees : fallback.fanDegrees,
  };
}

function sanitizeRound(raw: unknown, fallback: RoundGeometry): RoundGeometry {
  const r = (raw ?? {}) as Partial<RoundGeometry>;
  return {
    card: sanitizeCard(r.card, fallback.card),
    row: sanitizeRow(r.row, fallback.row),
  };
}

function sanitizeSecondary(
  raw: unknown,
  fallback: SecondaryGroupGeometry,
): SecondaryGroupGeometry {
  const r = (raw ?? {}) as Partial<SecondaryGroupGeometry>;
  const vis = r.visibility;
  const pl = r.placement;
  return {
    visibility:
      vis === 'hidden' || vis === 'dimmed' || vis === 'face-down'
        ? vis
        : fallback.visibility,
    placement:
      pl === 'above' || pl === 'below' || pl === 'left' || pl === 'right'
        ? pl
        : fallback.placement,
    offsetPrimaryPct:
      typeof r.offsetPrimaryPct === 'number'
        ? r.offsetPrimaryPct
        : fallback.offsetPrimaryPct,
    offsetCrossPct:
      typeof r.offsetCrossPct === 'number'
        ? r.offsetCrossPct
        : fallback.offsetCrossPct,
    scale: typeof r.scale === 'number' && r.scale > 0 ? r.scale : fallback.scale,
    opacity:
      typeof r.opacity === 'number' ? r.opacity : fallback.opacity,
    grayscale:
      typeof r.grayscale === 'number' ? r.grayscale : fallback.grayscale,
  };
}

function sanitizePlacement(
  raw: unknown,
  fallback: OpponentShowdownPlacement,
): OpponentShowdownPlacement {
  const r = (raw ?? {}) as Partial<OpponentShowdownPlacement>;
  return {
    attachment:
      r.attachment === 'outer-edge' || r.attachment === 'chip-centered'
        ? r.attachment
        : fallback.attachment,
    xPctOfFelt:
      typeof r.xPctOfFelt === 'number' ? r.xPctOfFelt : fallback.xPctOfFelt,
    yPctOfFelt:
      typeof r.yPctOfFelt === 'number' ? r.yPctOfFelt : fallback.yPctOfFelt,
  };
}

function sanitizeShowdownRules(raw: unknown): ShowdownRulesState {
  const parsed = (raw ?? {}) as Partial<ShowdownRulesState>;
  const fb = DEFAULT_SHOWDOWN_RULES;
  const r3Raw = (parsed.rounds?.r3 ?? {}) as Partial<RoundGeometryR3>;
  return {
    placement: sanitizePlacement(parsed.placement, fb.placement),
    rounds: {
      r1: sanitizeRound(parsed.rounds?.r1, fb.rounds.r1),
      r2: sanitizeRound(parsed.rounds?.r2, fb.rounds.r2),
      r3: {
        ...sanitizeRound(r3Raw, fb.rounds.r3),
        secondary: sanitizeSecondary(r3Raw.secondary, fb.rounds.r3.secondary),
      },
    },
  };
}

// ─── Registry hookup ──────────────────────────────────────────────────────

import {
  registerDomain,
  useDomainSnapshot,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';

registerDomain<ShowdownRulesState>({
  key: SHOWDOWN_RULES_DOMAIN_KEY,
  defaults: DEFAULT_SHOWDOWN_RULES,
  sanitize: sanitizeShowdownRules,
  firstPaintCacheKey: SHOWDOWN_RULES_STORAGE_KEY,
});

export function loadShowdownRules(): ShowdownRulesState {
  try {
    return getSnapshot<ShowdownRulesState>(SHOWDOWN_RULES_DOMAIN_KEY);
  } catch {
    return DEFAULT_SHOWDOWN_RULES;
  }
}

/** @deprecated writes go through GeometryLabDraftProvider.applyAll(). */
export function saveShowdownRules(_state: ShowdownRulesState): void {
  // eslint-disable-next-line no-console
  console.warn(
    '[showdownConfig] saveShowdownRules() is deprecated — writes must go through GeometryLabDraftProvider.applyAll().',
  );
}

export function useThreeFiveSevenShowdownConfig(): ShowdownRulesState {
  return useDomainSnapshot<ShowdownRulesState>(SHOWDOWN_RULES_DOMAIN_KEY);
}

// ─── Resolution ───────────────────────────────────────────────────────────

export interface ResolvedRound {
  /** Pixel card width. */
  cardWidthPx: number;
  /** Pixel card height (= width * aspectRatio). */
  cardHeightPx: number;
  /** Pixel overlap (= overlap fraction * cardWidthPx). */
  overlapPx: number;
  /** Total degrees spread first→last. Per-card step derived at render. */
  fanDegrees: number;
}

export interface ResolvedSecondary {
  visibility: 'hidden' | 'dimmed' | 'face-down';
  placement: 'above' | 'below' | 'left' | 'right';
  offsetPrimaryPct: number;
  offsetCrossPct: number;
  scale: number;
  opacity: number;
  grayscale: number;
  /** Secondary card pixel dims (= main * scale). */
  cardWidthPx: number;
  cardHeightPx: number;
  overlapPx: number;
}

export interface ResolvedShowdownRules {
  placement: OpponentShowdownPlacement;
  r1: ResolvedRound;
  r2: ResolvedRound;
  r3: ResolvedRound & { secondary: ResolvedSecondary };
}

/** Hard clamps prevent invalid / unmeasured felt from collapsing cards. */
export const MIN_CARD_WIDTH_PX = 12;
export const MAX_CARD_WIDTH_PX = 240;
/** Last-resort width when feltVminPx is non-positive in responsive mode. */
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

function resolveRound(g: RoundGeometry, feltVminPx: number): ResolvedRound {
  const { w, h } = resolveCardPx(g.card, feltVminPx);
  return {
    cardWidthPx: w,
    cardHeightPx: h,
    overlapPx: Math.max(0, g.row.overlap) * w,
    fanDegrees: g.row.fanDegrees,
  };
}

/**
 * Resolve config → pixel-space values.
 * `feltVminPx` = min(feltWidth, feltHeight) in CSS pixels — only used
 * for `responsive` sizing mode. Pass 0 (or any value) when every round
 * is in `fixed` mode; it will be ignored.
 */
export function resolveShowdownRules(
  state: ShowdownRulesState,
  feltVminPx: number,
): ResolvedShowdownRules {
  const r1 = resolveRound(state.rounds.r1, feltVminPx);
  const r2 = resolveRound(state.rounds.r2, feltVminPx);
  const r3Main = resolveRound(state.rounds.r3, feltVminPx);
  const sec = state.rounds.r3.secondary;
  const secondary: ResolvedSecondary = {
    visibility: sec.visibility,
    placement: sec.placement,
    offsetPrimaryPct: sec.offsetPrimaryPct,
    offsetCrossPct: sec.offsetCrossPct,
    scale: sec.scale,
    opacity: sec.opacity,
    grayscale: sec.grayscale,
    cardWidthPx: r3Main.cardWidthPx * sec.scale,
    cardHeightPx: r3Main.cardHeightPx * sec.scale,
    overlapPx: r3Main.overlapPx * sec.scale,
  };
  return {
    placement: state.placement,
    r1,
    r2,
    r3: { ...r3Main, secondary },
  };
}

/**
 * Per-card rotation in degrees for a fanDegrees TOTAL spread across n
 * cards. Card at index `i` (0-based). Centered at 0; first = -total/2.
 */
export function fanRotationDeg(
  totalDegrees: number,
  index: number,
  count: number,
): number {
  if (count <= 1) return 0;
  const step = totalDegrees / (count - 1);
  return step * (index - (count - 1) / 2);
}

/**
 * Visual extent of a flat row in pixels: width consumed by `n` cards
 * with `overlapPx` between successive cards. Used as the basis for
 * R3 secondary-group % offsets.
 */
export function rowExtentPx(
  cardWidthPx: number,
  overlapPx: number,
  n: number,
): number {
  if (n <= 0) return 0;
  if (n === 1) return cardWidthPx;
  return cardWidthPx + (n - 1) * Math.max(0, cardWidthPx - overlapPx);
}
