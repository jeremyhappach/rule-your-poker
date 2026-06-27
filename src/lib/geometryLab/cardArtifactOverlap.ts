/**
 * Geometry Lab — Card Artifact Overlap (universal contract).
 *
 * One persisted shared "fanOverlap" knob per multi-card gameplay
 * artifact. Normalized relative to card width:
 *
 *   nextCardOffsetPx = cardWidthPx * (1 - fanOverlap)
 *
 *   fanOverlap =  0.00 → adjacent card edges touch
 *   fanOverlap >  0    → overlap (fraction of card width hidden)
 *   fanOverlap <  0    → proportional gap (fraction of card width)
 *
 * Renderer migration helper for the legacy `marginLeft: -overlapPx`
 * pattern: marginLeft = -fanOverlap * cardWidthPx (allows negative for
 * gaps). For `preferredOverlapRatio` resolver consumers, pass the
 * fanOverlap value as-is and let the resolver clamp / re-derive.
 *
 * Holm/3-5-7 showdown overlaps remain owned by their existing
 * `holm_showdown_rules.row.overlap` and
 * `three_five_seven_showdown_rules.rounds.r{1,2,3}.row.overlap` fields.
 * The consolidated admin section reads/writes those fields through the
 * modal-wide draft via `useGeometryLabDraft` (no duplicate persisted
 * sources). The bridge keys in INVENTORY mark them for UI assembly.
 */

import {
  registerDomain,
  useDomainSnapshot,
  getSnapshot,
} from './defaultsRegistry';

// ─── Independent overlap domains (one row per system_settings row) ──────

export interface CardOverlapDomain {
  /** system_settings.key */
  key: string;
  /** Short admin label. */
  label: string;
  /** Longer admin help text. */
  help: string;
  /** Seed (preserves current visual). Normalized fan overlap. */
  default: number;
  /** localStorage first-paint cache key. */
  cacheKey: string;
  /** Min/max admin slider range. */
  min: number;
  max: number;
  step: number;
}

function sanitizeNumber(fallback: number) {
  return (raw: unknown): number => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'object' && raw !== null) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return fallback;
  };
}

// Seeded from a static audit of current rendering paths:
//
//   holm.community           : resolver preferredOverlapRatio = 0.03
//   holm.lonePlayerFan       : resolver preferredOverlapRatio = 0.18 (count > 3)
//   holm.selfHand            : not migrated this pass (legacy SELF_LEGACY path)
//   cribbage.scoringHand     : gap-1 (4px) between md (40px) cards = -0.10
//   cribbage.scoringHandToCutGap : ml-2 (8px) between cluster and md cut card = 0.20
//   cribbage.pegging         : resolver preferredOverlapRatio = 0.18
//   cribbage.inHand          : resolver preferredOverlapRatio = 0.32 / 0.05 (phase-driven)
//                              consolidated control overrides the discarding (0.32) path
//   gin.inHand               : -space-x-4 (16px) on lg (~52px) cards = ~0.30
export const INDEPENDENT_OVERLAP_DOMAINS: CardOverlapDomain[] = [
  {
    key: 'cardOverlap.holm.community',
    label: 'Holm community cards',
    help: 'Community card row across all Holm community renderers.',
    default: 0.03,
    cacheKey: 'ptp_cardOverlap_holm_community',
    min: -0.5, max: 0.9, step: 0.01,
  },
  {
    key: 'cardOverlap.holm.lonePlayerFan',
    label: 'Holm lone-player fan',
    help: 'Lone-player tabled fan inside Holm showdown anchored slot.',
    default: 0.18,
    cacheKey: 'ptp_cardOverlap_holm_lonePlayerFan',
    min: -0.5, max: 0.9, step: 0.01,
  },
  {
    key: 'cardOverlap.cribbage.scoringHand',
    label: 'Cribbage scoring hand · fan overlap',
    help: 'Spacing inside the cribbage counting-hand card cluster (excludes cut card).',
    default: -0.10,
    cacheKey: 'ptp_cardOverlap_cribbage_scoringHand',
    min: -0.5, max: 0.9, step: 0.01,
  },
  {
    key: 'cardOverlap.cribbage.scoringHandToCutGap',
    label: 'Cribbage scoring hand ↔ cut card · gap',
    help: 'Horizontal separation between the completed hand cluster and the cut card. 0 = touching; positive = proportional gap (fraction of card width).',
    default: 0.20,
    cacheKey: 'ptp_cardOverlap_cribbage_scoringHandToCutGap',
    min: 0, max: 2, step: 0.01,
  },
  // NOTE: Cribbage pegging, Cribbage active-player hand, and Gin
  // active-player hand are intentionally NOT registered here. They are
  // HUDStack / adaptive-resolver contracts, not felt-artifact overlap
  // values. See useCardRowLayout consumers in Wave4PeggingRowSlot,
  // CribbageMobileCardsTab, and GinRummyMobileCardsTab.
];

// Register each domain at module import.
for (const d of INDEPENDENT_OVERLAP_DOMAINS) {
  registerDomain<number>({
    key: d.key,
    defaults: d.default,
    sanitize: sanitizeNumber(d.default),
    firstPaintCacheKey: d.cacheKey,
  });
}

// Bridge entries removed. Holm and 3-5-7 showdown overlap controls now
// live exclusively in their native Showdown Rules panels (single
// persisted source: holm_showdown_rules / three_five_seven_showdown_rules).


// ─── Runtime accessors ─────────────────────────────────────────────────

export function useCardOverlap(key: string): number {
  return useDomainSnapshot<number>(key);
}

export function loadCardOverlap(key: string, fallback: number): number {
  try {
    return getSnapshot<number>(key);
  } catch {
    return fallback;
  }
}

/** Convert a normalized fan overlap into the `marginLeft` value used by
 *  the legacy renderer pattern (after the first card). Negative result
 *  = overlap (cards stack); positive result = gap. */
export function fanOverlapToMarginLeftPx(
  fanOverlap: number,
  cardWidthPx: number,
): number {
  return -fanOverlap * cardWidthPx;
}
