/**
 * 3-5-7 Showdown Geometry — runtime resolver.
 *
 * Single source of truth for the Geometry Lab v2 "Opponent Exposed
 * Cards" configuration. Both the admin panel (editor) and the live
 * 3-5-7 showdown renderer (PlayerHand) read from here so that:
 *
 *   - At default values, the resolved geometry equals the previous
 *     hardcoded constants pixel-for-pixel (baseline parity).
 *   - Edits made in the Lab propagate to the renderer at runtime
 *     (storage event + custom event for same-tab updates).
 *   - The parity panel in the Lab can compare the frozen LIVE_BASELINE
 *     against the currently-resolved Lab values.
 *
 * This module is consumed ONLY by the 3-5-7 opponent showdown render
 * path. PlayerHand's non-3-5-7 branches are not touched.
 */

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

export type AnchorKind = 'belowChip';

export interface CardSizePx {
  mobileWidthPx: number;
  mobileHeightPx: number;
  smWidthPx: number;
  smHeightPx: number;
}

export interface OverlapPx {
  mobilePx: number;
  smPx: number;
}

export interface FanDegPerCard {
  stepDeg: number;
}

export interface DynResolverParams {
  enabled: boolean;
  aspect: number;
  minCardWidth: number;
  maxCardWidth: number;
  maxOverlapRatio: number;
  preferredOverlapRatio: number;
}

export interface RoundRowConfig {
  size: CardSizePx;
  overlap: OverlapPx;
  fan: FanDegPerCard;
  dyn: DynResolverParams;
}

export interface IrrelevantPairConfig {
  visible: boolean;
  dimmed: boolean;
  scale: number;
  opacity: number;
  grayscalePct: number;
  interRowGapPx: number;
  size: CardSizePx;
  overlap: OverlapPx;
  positionMode: 'auto' | 'above' | 'below';
}

export interface AnchorConfig {
  kind: AnchorKind;
  belowChipGapPx: number;
}

/**
 * Opponent showdown row placement contract (P2 — felt-relative).
 *
 * Conceptual model
 * ----------------
 *   anchor      : the opponent's canonical chipstack center
 *                 (CanonicalSeatCluster chip cell).
 *   attachment  : how the row's own X self-anchor lines up with the
 *                 chip-center anchor.
 *                  - 'chip-centered' : translateX(-50%) — row centered
 *                                      horizontally over the chip
 *                                      (legacy parity baseline).
 *                  - 'outer-edge'    : translateX(0%) for left-side
 *                                      opponents (row outer-left edge
 *                                      at chip center) and
 *                                      translateX(-100%) for right-side
 *                                      opponents (row outer-right edge
 *                                      at chip center). Automatic
 *                                      mirroring — one setting, both
 *                                      sides.
 *   xPctOfPlayfield : horizontal offset as % of the canonical PLAYFIELD
 *                     (felt) width. Resolved to pixels at the shell
 *                     boundary via usePlayGeometry() — sizing of cards
 *                     / overlap / fan can NEVER alter this offset.
 *                     Positive = INWARD toward felt center (sign is
 *                     flipped at the seat for left/right opponents).
 *   yPctOfPlayfield : vertical offset as % of canonical PLAYFIELD
 *                     (felt) height. Positive = downward on both sides.
 *
 * Legacy-parity defaults
 * ----------------------
 *   attachment: 'chip-centered', xPctOfPlayfield: 0, yPctOfPlayfield: 0
 *   → exactly equivalent to the cluster's pre-existing
 *     `left-1/2 -translate-x-1/2 mt-[2px]` below-chip baseline.
 */
export interface OpponentShowdownPlacement {
  anchor: 'chipstack-center';
  attachment: 'chip-centered' | 'outer-edge';
  /** Horizontal offset, % of canonical felt WIDTH. Positive = inward. */
  xPctOfPlayfield: number;
  /** Vertical offset, % of canonical felt HEIGHT. Positive = downward. */
  yPctOfPlayfield: number;
}


export interface ShowdownRulesState {
  anchor: AnchorConfig;
  /** P2 opponent-row placement adapter (shared across R1/R2/R3). */
  opponentRowPlacement: OpponentShowdownPlacement;
  three: RoundRowConfig;
  five: RoundRowConfig;
  seven: RoundRowConfig;
  sevenIrrelevant: IrrelevantPairConfig;
}

/** Parity default — chip-centered, zero offset → identical to legacy. */
const SEED_OPPONENT_ROW_PLACEMENT: OpponentShowdownPlacement = {
  anchor: 'chipstack-center',
  attachment: 'chip-centered',
  xPctOfPlayfield: 0,
  yPctOfPlayfield: 0,
};



// ─── Live baseline (frozen) ───────────────────────────────────────────────
// Values verbatim from the pre-migration live renderer.
//   PlayerHand.tsx:236 — R1 `w-10 h-16 sm:w-11 sm:h-[4.25rem]`
//   PlayerHand.tsx:249 — R1 overlap `-ml-1`
//   PlayerHand.tsx:597–637 — R2/R3 main `'lg'` = `w-8 h-12 sm:w-9 sm:h-14`,
//     `-ml-3`, fan 2°/card.
//   PlayerHand.tsx:598–614 — irrelevant pair `'sm'` = `w-6 h-9 sm:w-7 sm:h-10`,
//     `-ml-2`, scale 0.85, opacity 0.4, isDimmed→grayscale 30%.
//   PlayerHand.tsx:648 — `gap-0.5` = 2 px inter-row.
//   PlayerHand.tsx:443–453 — dyn357 resolver params.
//   CanonicalSeatCluster.tsx:742 — `mt-[2px]`.

const SEED_THREE: RoundRowConfig = {
  size: { mobileWidthPx: 40, mobileHeightPx: 64, smWidthPx: 44, smHeightPx: 68 },
  overlap: { mobilePx: 4, smPx: 4 },
  fan: { stepDeg: 2 },
  dyn: {
    enabled: true,
    aspect: 0.71,
    minCardWidth: 28,
    maxCardWidth: 80,
    maxOverlapRatio: 0.6,
    preferredOverlapRatio: 0.18,
  },
};

const SEED_FIVE_SEVEN_MAIN: RoundRowConfig = {
  size: { mobileWidthPx: 32, mobileHeightPx: 48, smWidthPx: 36, smHeightPx: 56 },
  overlap: { mobilePx: 12, smPx: 12 },
  fan: { stepDeg: 2 },
  dyn: {
    enabled: false,
    aspect: 0.71,
    minCardWidth: 28,
    maxCardWidth: 80,
    maxOverlapRatio: 0.6,
    preferredOverlapRatio: 0.18,
  },
};

const SEED_SEVEN_IRRELEVANT: IrrelevantPairConfig = {
  visible: true,
  dimmed: true,
  scale: 0.85,
  opacity: 0.4,
  grayscalePct: 30,
  interRowGapPx: 2,
  size: { mobileWidthPx: 24, mobileHeightPx: 36, smWidthPx: 28, smHeightPx: 40 },
  overlap: { mobilePx: 8, smPx: 8 },
  positionMode: 'auto',
};

export const DEFAULT_SHOWDOWN_RULES: ShowdownRulesState = {
  anchor: { kind: 'belowChip', belowChipGapPx: 2 },
  opponentRowPlacement: { ...SEED_OPPONENT_ROW_PLACEMENT },
  three: SEED_THREE,
  five: { ...SEED_FIVE_SEVEN_MAIN },
  seven: { ...SEED_FIVE_SEVEN_MAIN },
  sevenIrrelevant: SEED_SEVEN_IRRELEVANT,
};


/** Deep-frozen snapshot of the pre-migration live constants. */
export const LIVE_BASELINE: ShowdownRulesState = deepFreeze(
  JSON.parse(JSON.stringify(DEFAULT_SHOWDOWN_RULES)),
);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o as Record<string, unknown>).forEach((v) => deepFreeze(v));
    Object.freeze(o);
  }
  return o;
}

// ─── Persistence ──────────────────────────────────────────────────────────
//
// Phase 1 migration: this domain is now a consumer of the shared Geometry
// Lab defaults registry (`public.system_settings`, key
// `three_five_seven_showdown_rules`). The legacy localStorage key remains
// referenced as a first-paint cache only — it is never the runtime
// authority once the shared substrate has loaded. Writes go through
// `GeometryLabDraftProvider.applyAll()`, not through any function here.

export const SHOWDOWN_RULES_STORAGE_KEY =
  'geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v3';

export const SHOWDOWN_RULES_DOMAIN_KEY = 'three_five_seven_showdown_rules';

function mergeRow(base: RoundRowConfig, raw: unknown): RoundRowConfig {
  const r = (raw ?? {}) as Partial<RoundRowConfig>;
  return {
    size: { ...base.size, ...(r.size ?? {}) },
    overlap: { ...base.overlap, ...(r.overlap ?? {}) },
    fan: { ...base.fan, ...(r.fan ?? {}) },
    dyn: { ...base.dyn, ...(r.dyn ?? {}) },
  };
}

function sanitizeShowdownRules(raw: unknown): ShowdownRulesState {
  const parsed = (raw ?? {}) as Partial<ShowdownRulesState>;
  return {
    anchor: { ...DEFAULT_SHOWDOWN_RULES.anchor, ...(parsed.anchor ?? {}) },
    opponentRowPlacement: {
      ...DEFAULT_SHOWDOWN_RULES.opponentRowPlacement,
      ...(parsed.opponentRowPlacement ?? {}),
    },
    three: mergeRow(DEFAULT_SHOWDOWN_RULES.three, parsed.three),
    five: mergeRow(DEFAULT_SHOWDOWN_RULES.five, parsed.five),
    seven: mergeRow(DEFAULT_SHOWDOWN_RULES.seven, parsed.seven),
    sevenIrrelevant: {
      ...DEFAULT_SHOWDOWN_RULES.sevenIrrelevant,
      ...(parsed.sevenIrrelevant ?? {}),
      size: {
        ...DEFAULT_SHOWDOWN_RULES.sevenIrrelevant.size,
        ...((parsed.sevenIrrelevant ?? {}).size ?? {}),
      },
      overlap: {
        ...DEFAULT_SHOWDOWN_RULES.sevenIrrelevant.overlap,
        ...((parsed.sevenIrrelevant ?? {}).overlap ?? {}),
      },
    },
  };
}

// Register the domain exactly once at module load.
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

/**
 * Back-compat read: returns the registry's current snapshot. The Geometry
 * Lab modal no longer calls this for editing — drafts come from the
 * draft provider. Kept for diagnostics / non-editing callers.
 */
export function loadShowdownRules(): ShowdownRulesState {
  try {
    return getSnapshot<ShowdownRulesState>(SHOWDOWN_RULES_DOMAIN_KEY);
  } catch {
    return DEFAULT_SHOWDOWN_RULES;
  }
}

/**
 * @deprecated Writes now go through GeometryLabDraftProvider.applyAll().
 * Kept as a no-op so any straggling caller fails loudly in dev rather
 * than silently writing per-device state.
 */
export function saveShowdownRules(_state: ShowdownRulesState): void {
  // eslint-disable-next-line no-console
  console.warn(
    '[showdownConfig] saveShowdownRules() is deprecated — writes must go through GeometryLabDraftProvider.applyAll().',
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useThreeFiveSevenShowdownConfig(): ShowdownRulesState {
  return useDomainSnapshot<ShowdownRulesState>(SHOWDOWN_RULES_DOMAIN_KEY);
}

// ─── Breakpoint helper ────────────────────────────────────────────────────
// Tailwind `sm` breakpoint = 640 px (default theme).

const SM_MIN_PX = 640;

export function useIsSmBreakpoint(): boolean {
  const [isSm, setIsSm] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(`(min-width: ${SM_MIN_PX}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${SM_MIN_PX}px)`);
    const handler = () => setIsSm(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isSm;
}

// ─── Resolution (px values at active breakpoint) ──────────────────────────

export interface ResolvedRoundRow {
  widthPx: number;
  heightPx: number;
  overlapPx: number;
  fanStepDeg: number;
  dyn: DynResolverParams;
}

export interface ResolvedIrrelevant {
  visible: boolean;
  dimmed: boolean;
  scale: number;
  opacity: number;
  grayscalePct: number;
  interRowGapPx: number;
  widthPx: number;
  heightPx: number;
  overlapPx: number;
  positionMode: 'auto' | 'above' | 'below';
}

export interface ResolvedShowdownRules {
  anchor: { kind: AnchorKind; belowChipGapPx: number };
  /** P1 opponent-row placement (breakpoint-independent, pass-through). */
  opponentRowPlacement: OpponentShowdownPlacement;
  three: ResolvedRoundRow;
  five: ResolvedRoundRow;
  seven: ResolvedRoundRow;
  sevenIrrelevant: ResolvedIrrelevant;
  /** 'mobile' | 'sm' — which breakpoint values were chosen. */
  breakpoint: 'mobile' | 'sm';
}


function resolveRow(cfg: RoundRowConfig, isSm: boolean): ResolvedRoundRow {
  return {
    widthPx: isSm ? cfg.size.smWidthPx : cfg.size.mobileWidthPx,
    heightPx: isSm ? cfg.size.smHeightPx : cfg.size.mobileHeightPx,
    overlapPx: isSm ? cfg.overlap.smPx : cfg.overlap.mobilePx,
    fanStepDeg: cfg.fan.stepDeg,
    dyn: cfg.dyn,
  };
}

function resolveIrrelevant(
  cfg: IrrelevantPairConfig,
  isSm: boolean,
): ResolvedIrrelevant {
  return {
    visible: cfg.visible,
    dimmed: cfg.dimmed,
    scale: cfg.scale,
    opacity: cfg.opacity,
    grayscalePct: cfg.grayscalePct,
    interRowGapPx: cfg.interRowGapPx,
    widthPx: isSm ? cfg.size.smWidthPx : cfg.size.mobileWidthPx,
    heightPx: isSm ? cfg.size.smHeightPx : cfg.size.mobileHeightPx,
    overlapPx: isSm ? cfg.overlap.smPx : cfg.overlap.mobilePx,
    positionMode: cfg.positionMode,
  };
}

export function resolveShowdownRules(
  state: ShowdownRulesState,
  isSm: boolean,
): ResolvedShowdownRules {
  return {
    anchor: state.anchor,
    opponentRowPlacement: state.opponentRowPlacement,

    three: resolveRow(state.three, isSm),
    five: resolveRow(state.five, isSm),
    seven: resolveRow(state.seven, isSm),
    sevenIrrelevant: resolveIrrelevant(state.sevenIrrelevant, isSm),
    breakpoint: isSm ? 'sm' : 'mobile',
  };
}
