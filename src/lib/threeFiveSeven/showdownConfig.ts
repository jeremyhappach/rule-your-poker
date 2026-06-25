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
 * Opponent showdown row placement contract (P1 adapter).
 *
 * Conceptual model
 * ----------------
 *   anchor      : the opponent's canonical chipstack center
 *                 (`[data-chip-center="${position}"]`).
 *   attachment  : the row's *outer* edge attaches to the anchor —
 *                 outer-left for a left-side opponent, outer-right for a
 *                 right-side opponent. The single placement object thus
 *                 mirrors automatically: the implementation flips X sign
 *                 based on `isRightSide`, never duplicating values.
 *   xPct        : INWARD shift (toward the felt center), expressed as a
 *                 percentage of the row's OWN measured width. This is a
 *                 normalized seat-relative coordinate frame — independent
 *                 of viewport pixels and of arbitrary DOM-parent pixels.
 *   yPct        : Vertical shift, percentage of the row's OWN measured
 *                 height. Positive = downward in screen space (same sign
 *                 for both opponents — left/right mirroring is X-only).
 *
 * Legacy-parity defaults
 * ----------------------
 *   The live renderer places the showdown row centered on the chip
 *   horizontally and 2 px below/above it vertically (the 2 px gap is
 *   owned by CanonicalSeatCluster's [data-canonical-seat-below]
 *   wrapper and is NOT replaced by this adapter — yPct extends from
 *   that baseline).
 *
 *   With "outer-edge attached to chip center", a zero offset would
 *   shift the row by half its own width outward from the current
 *   centered position. To preserve visual parity at defaults we
 *   therefore initialise xPct = 50 (= one half-width back to center)
 *   and yPct = 0 (the 2 px baseline gap is preserved by the wrapper).
 */
export interface OpponentShowdownPlacement {
  anchor: 'chipstack-center';
  attachment: 'outer-edge';
  /** Inward shift, % of row width. 50 = visually centered (parity). */
  xPct: number;
  /** Vertical shift, % of row height. 0 = parity baseline. */
  yPct: number;
}


export interface ShowdownRulesState {
  anchor: AnchorConfig;
  /** P1 opponent-row placement adapter (shared across R1/R2/R3). */
  opponentRowPlacement: OpponentShowdownPlacement;
  three: RoundRowConfig;
  five: RoundRowConfig;
  seven: RoundRowConfig;
  sevenIrrelevant: IrrelevantPairConfig;
}

/** Defaults derived for visual parity with the legacy centered baseline. */
const SEED_OPPONENT_ROW_PLACEMENT: OpponentShowdownPlacement = {
  anchor: 'chipstack-center',
  attachment: 'outer-edge',
  xPct: 50, // inward by half-row-width → equals legacy centered position
  yPct: 0,  // legacy 2 px baseline gap preserved by cluster wrapper
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

export const SHOWDOWN_RULES_STORAGE_KEY =
  'geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v2';

/** Custom event for same-tab listeners (storage event only fires cross-tab). */
const SHOWDOWN_RULES_UPDATE_EVENT = 'ptp:357showdownRules:updated';

function mergeRow(base: RoundRowConfig, raw: unknown): RoundRowConfig {
  const r = (raw ?? {}) as Partial<RoundRowConfig>;
  return {
    size: { ...base.size, ...(r.size ?? {}) },
    overlap: { ...base.overlap, ...(r.overlap ?? {}) },
    fan: { ...base.fan, ...(r.fan ?? {}) },
    dyn: { ...base.dyn, ...(r.dyn ?? {}) },
  };
}

export function loadShowdownRules(): ShowdownRulesState {
  if (typeof window === 'undefined') return DEFAULT_SHOWDOWN_RULES;
  try {
    const raw = window.localStorage.getItem(SHOWDOWN_RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_SHOWDOWN_RULES;
    const parsed = JSON.parse(raw);
    return {
      anchor: { ...DEFAULT_SHOWDOWN_RULES.anchor, ...(parsed.anchor ?? {}) },
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
  } catch {
    return DEFAULT_SHOWDOWN_RULES;
  }
}

export function saveShowdownRules(state: ShowdownRulesState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SHOWDOWN_RULES_STORAGE_KEY,
      JSON.stringify(state),
    );
    window.dispatchEvent(new CustomEvent(SHOWDOWN_RULES_UPDATE_EVENT));
  } catch {
    /* */
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useThreeFiveSevenShowdownConfig(): ShowdownRulesState {
  const [cfg, setCfg] = useState<ShowdownRulesState>(() => loadShowdownRules());
  useEffect(() => {
    const onChange = () => setCfg(loadShowdownRules());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHOWDOWN_RULES_STORAGE_KEY) onChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SHOWDOWN_RULES_UPDATE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SHOWDOWN_RULES_UPDATE_EVENT, onChange);
    };
  }, []);
  return cfg;
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
    three: resolveRow(state.three, isSm),
    five: resolveRow(state.five, isSm),
    seven: resolveRow(state.seven, isSm),
    sevenIrrelevant: resolveIrrelevant(state.sevenIrrelevant, isSm),
    breakpoint: isSm ? 'sm' : 'mobile',
  };
}
