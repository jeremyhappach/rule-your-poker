/**
 * Card Front Design — Phase 1 (face-density tiers; PlayingCard only).
 *
 * S / M / L are FACE-DENSITY policies. They do not change card width,
 * height, aspect ratio, overlap, fan, or placement. Each tier carries
 * two independent face policies because 2-color and 4-color decks
 * compose the face differently:
 *
 *   - twoColor → center-stack rank + suit
 *   - fourColor → rank only (no suit symbol; suit signal is the bg color)
 *
 * Phase 1 ships PlayingCard wiring only. Cribbage / Mini primitives,
 * corner+center layouts, corner insets, center pips, and any card-size
 * controls are deferred.
 */

import {
  registerDomain,
  useDomainSnapshot,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';

// ─── Types ────────────────────────────────────────────────────────────────

export type CardFrontTierKey = 'small' | 'medium' | 'large';

export interface TwoColorFacePolicy {
  layout: 'center-stack';
  rankScalePctOfCardWidth: number;
  suitScalePctOfCardWidth: number;
  rankSuitGapPctOfCardHeight: number;
  groupOffsetXPctOfCardWidth: number;
  groupOffsetYPctOfCardHeight: number;
}

export interface FourColorFacePolicy {
  layout: 'rank-only';
  rankScalePctOfCardWidth: number;
  rankOffsetXPctOfCardWidth: number;
  rankOffsetYPctOfCardHeight: number;
}

export interface CardFrontTier {
  twoColor: TwoColorFacePolicy;
  fourColor: FourColorFacePolicy;
}

export interface CardFrontDesignConfig {
  tiers: Record<CardFrontTierKey, CardFrontTier>;
}

// ─── Seeds ────────────────────────────────────────────────────────────────
//
// Medium and Large seed near the prior Tailwind look so migrated callers
// have no visible regression. Small is INTENTIONALLY compact — its
// purpose is to shrink oversized 3-5-7 opponent-showdown face art.

export const DEFAULT_CARD_FRONT_DESIGN: CardFrontDesignConfig = {
  tiers: {
    small: {
      twoColor: {
        layout: 'center-stack',
        rankScalePctOfCardWidth: 42,
        suitScalePctOfCardWidth: 36,
        rankSuitGapPctOfCardHeight: 2,
        groupOffsetXPctOfCardWidth: 0,
        groupOffsetYPctOfCardHeight: 0,
      },
      fourColor: {
        layout: 'rank-only',
        rankScalePctOfCardWidth: 58,
        rankOffsetXPctOfCardWidth: 0,
        rankOffsetYPctOfCardHeight: 0,
      },
    },
    medium: {
      twoColor: {
        layout: 'center-stack',
        rankScalePctOfCardWidth: 56,
        suitScalePctOfCardWidth: 50,
        rankSuitGapPctOfCardHeight: 3,
        groupOffsetXPctOfCardWidth: 0,
        groupOffsetYPctOfCardHeight: 0,
      },
      fourColor: {
        layout: 'rank-only',
        rankScalePctOfCardWidth: 72,
        rankOffsetXPctOfCardWidth: 0,
        rankOffsetYPctOfCardHeight: 0,
      },
    },
    large: {
      twoColor: {
        layout: 'center-stack',
        rankScalePctOfCardWidth: 64,
        suitScalePctOfCardWidth: 58,
        rankSuitGapPctOfCardHeight: 4,
        groupOffsetXPctOfCardWidth: 0,
        groupOffsetYPctOfCardHeight: 0,
      },
      fourColor: {
        layout: 'rank-only',
        rankScalePctOfCardWidth: 82,
        rankOffsetXPctOfCardWidth: 0,
        rankOffsetYPctOfCardHeight: 0,
      },
    },
  },
};

// ─── Persistence keys ─────────────────────────────────────────────────────

export const CARD_FRONT_DESIGN_DOMAIN_KEY = 'card_front_design';
export const CARD_FRONT_DESIGN_STORAGE_KEY =
  'geometryLab.cardFrontDesign.v1';

// ─── Sanitize ─────────────────────────────────────────────────────────────

function n(raw: unknown, fb: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fb;
}

function sanitizeTwo(
  raw: unknown,
  fb: TwoColorFacePolicy,
): TwoColorFacePolicy {
  const r = (raw ?? {}) as Partial<TwoColorFacePolicy>;
  return {
    layout: 'center-stack',
    rankScalePctOfCardWidth: n(r.rankScalePctOfCardWidth, fb.rankScalePctOfCardWidth),
    suitScalePctOfCardWidth: n(r.suitScalePctOfCardWidth, fb.suitScalePctOfCardWidth),
    rankSuitGapPctOfCardHeight: n(r.rankSuitGapPctOfCardHeight, fb.rankSuitGapPctOfCardHeight),
    groupOffsetXPctOfCardWidth: n(r.groupOffsetXPctOfCardWidth, fb.groupOffsetXPctOfCardWidth),
    groupOffsetYPctOfCardHeight: n(r.groupOffsetYPctOfCardHeight, fb.groupOffsetYPctOfCardHeight),
  };
}

function sanitizeFour(
  raw: unknown,
  fb: FourColorFacePolicy,
): FourColorFacePolicy {
  const r = (raw ?? {}) as Partial<FourColorFacePolicy>;
  return {
    layout: 'rank-only',
    rankScalePctOfCardWidth: n(r.rankScalePctOfCardWidth, fb.rankScalePctOfCardWidth),
    rankOffsetXPctOfCardWidth: n(r.rankOffsetXPctOfCardWidth, fb.rankOffsetXPctOfCardWidth),
    rankOffsetYPctOfCardHeight: n(r.rankOffsetYPctOfCardHeight, fb.rankOffsetYPctOfCardHeight),
  };
}

function sanitizeTier(raw: unknown, fb: CardFrontTier): CardFrontTier {
  const r = (raw ?? {}) as Partial<CardFrontTier>;
  return {
    twoColor: sanitizeTwo(r.twoColor, fb.twoColor),
    fourColor: sanitizeFour(r.fourColor, fb.fourColor),
  };
}

function sanitizeCardFrontDesign(raw: unknown): CardFrontDesignConfig {
  const r = (raw ?? {}) as Partial<CardFrontDesignConfig>;
  const fb = DEFAULT_CARD_FRONT_DESIGN;
  const t = (r.tiers ?? {}) as Partial<Record<CardFrontTierKey, CardFrontTier>>;
  return {
    tiers: {
      small: sanitizeTier(t.small, fb.tiers.small),
      medium: sanitizeTier(t.medium, fb.tiers.medium),
      large: sanitizeTier(t.large, fb.tiers.large),
    },
  };
}

// ─── Registry hookup ──────────────────────────────────────────────────────

registerDomain<CardFrontDesignConfig>({
  key: CARD_FRONT_DESIGN_DOMAIN_KEY,
  defaults: DEFAULT_CARD_FRONT_DESIGN,
  sanitize: sanitizeCardFrontDesign,
  firstPaintCacheKey: CARD_FRONT_DESIGN_STORAGE_KEY,
});

export function loadCardFrontDesign(): CardFrontDesignConfig {
  try {
    return getSnapshot<CardFrontDesignConfig>(CARD_FRONT_DESIGN_DOMAIN_KEY);
  } catch {
    return DEFAULT_CARD_FRONT_DESIGN;
  }
}

export function useCardFrontDesign(): CardFrontDesignConfig {
  return useDomainSnapshot<CardFrontDesignConfig>(CARD_FRONT_DESIGN_DOMAIN_KEY);
}

// ─── Runtime resolver ─────────────────────────────────────────────────────

export type DeckFaceMode = 'two-color' | 'four-color';

export interface ResolvedCardFrontStyle {
  /** Inline style for the rank span. Always present. */
  rankStyle: React.CSSProperties;
  /** Inline style for the suit span. Null in four-color (rank-only). */
  suitStyle: React.CSSProperties | null;
  /** True if the suit symbol should render. */
  renderSuit: boolean;
}

const MIN_FONT_PX = 4;
const MAX_FONT_PX = 200;

function clampPx(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return MIN_FONT_PX;
  return Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, v));
}

/**
 * Pure: resolve face typography for a single card, given the tier and
 * the EFFECTIVE card width/height in CSS px. faceFillPx callers must
 * pass their resolved card dimensions here too — no legacy fallback,
 * no override path.
 */
export function resolveCardFrontStyle(
  config: CardFrontDesignConfig,
  tierKey: CardFrontTierKey,
  deckMode: DeckFaceMode,
  cardWidthPx: number,
  cardHeightPx: number,
): ResolvedCardFrontStyle {
  const tier = config.tiers[tierKey] ?? config.tiers.medium;
  const w = Number.isFinite(cardWidthPx) && cardWidthPx > 0 ? cardWidthPx : 32;
  const h = Number.isFinite(cardHeightPx) && cardHeightPx > 0 ? cardHeightPx : Math.round(w * 1.4);

  if (deckMode === 'four-color') {
    const p = tier.fourColor;
    const rankPx = clampPx((p.rankScalePctOfCardWidth / 100) * w);
    const dx = (p.rankOffsetXPctOfCardWidth / 100) * w;
    const dy = (p.rankOffsetYPctOfCardHeight / 100) * h;
    return {
      rankStyle: {
        fontSize: `${rankPx}px`,
        lineHeight: 1,
        fontWeight: 900,
        transform: dx || dy ? `translate(${dx}px, ${dy}px)` : undefined,
      },
      suitStyle: null,
      renderSuit: false,
    };
  }

  const p = tier.twoColor;
  const rankPx = clampPx((p.rankScalePctOfCardWidth / 100) * w);
  const suitPx = clampPx((p.suitScalePctOfCardWidth / 100) * w);
  const gapPx = (p.rankSuitGapPctOfCardHeight / 100) * h;
  const dx = (p.groupOffsetXPctOfCardWidth / 100) * w;
  const dy = (p.groupOffsetYPctOfCardHeight / 100) * h;
  const groupTransform = dx || dy ? `translate(${dx}px, ${dy}px)` : undefined;
  // lineHeight:1 embeds ~20-25% font-metric padding around the visible
  // glyph, which acts as a hidden minimum gap and absorbs sub-1% values
  // (0% and ~0.5% look identical). Collapse the line box to the glyph
  // cap height so `marginTop = gapPx` is the SOLE spacing between the
  // visible rank and suit glyphs. Fractional/sub-pixel marginTop values
  // are preserved verbatim — no rounding, no minimum clamp.
  const TIGHT_LINE_HEIGHT = 0.72;
  return {
    rankStyle: {
      fontSize: `${rankPx}px`,
      lineHeight: TIGHT_LINE_HEIGHT,
      fontWeight: 900,
      display: 'block',
      transform: groupTransform,
    },
    suitStyle: {
      fontSize: `${suitPx}px`,
      lineHeight: TIGHT_LINE_HEIGHT,
      display: 'block',
      marginTop: `${gapPx}px`,
      transform: groupTransform,
    },
    renderSuit: true,
  };
}
