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
  size: CardSizePx;
  overlap: OverlapPx;
  positionMode: 'auto' | 'above' | 'below';
}

export interface AnchorConfig {
  kind: AnchorKind;
  belowChipGapPx: number;
}

export interface ShowdownRulesState {
  anchor: AnchorConfig;
  three: RoundRowConfig;
  five: RoundRowConfig;
  seven: RoundRowConfig;
  sevenIrrelevant: IrrelevantPairConfig;
}

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

// ─── Seat-below baseline & renderer-consumed reporter ─────────────────────
//
// CanonicalSeatCluster's `data-canonical-seat-below` wrapper hard-codes a
// `mt-[2px]` gap from the chip cell. The 3-5-7 exposed-opponent showdown
// adapter (ThreeFiveSevenOpponentShowdownGapAdapter) layers a translateY
// of (gap - SEAT_BELOW_STATIC_GAP_PX) on top of that so the EFFECTIVE
// renderer-consumed gap equals `resolved.anchor.belowChipGapPx`. At the
// default value (2) the delta is 0 — pixel parity with the pre-migration
// baseline. No other game's seat-below behavior changes.

export const SEAT_BELOW_STATIC_GAP_PX = 2;

type Listener = (value: number | null) => void;
let _rendererConsumedBelowChipGapPx: number | null = null;
const _listeners = new Set<Listener>();

export function publishRendererConsumedBelowChipGapPx(value: number | null): void {
  if (_rendererConsumedBelowChipGapPx === value) return;
  _rendererConsumedBelowChipGapPx = value;
  for (const l of _listeners) {
    try { l(value); } catch { /* */ }
  }
}

export function getRendererConsumedBelowChipGapPx(): number | null {
  return _rendererConsumedBelowChipGapPx;
}

export function useRendererConsumedBelowChipGapPx(): number | null {
  const [v, setV] = useState<number | null>(_rendererConsumedBelowChipGapPx);
  useEffect(() => {
    const cb: Listener = (val) => setV(val);
    _listeners.add(cb);
    setV(_rendererConsumedBelowChipGapPx);
    return () => { _listeners.delete(cb); };
  }, []);
  return v;
}
