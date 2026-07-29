/**
 * Canonical active-pane ACTION RESERVATION model (Phase 1).
 *
 * ─────────────────────────────────────────────────────────────────────
 * Two explicit layout modes describe the relationship between the
 * gameplay artifact (cards / dice) and the active player's controls:
 *
 *   reserved-strip   — controls occupy `rows` declared rows pinned at
 *                      the bottom of the active pane. Card geometry
 *                      receives ONLY the remaining vertical space.
 *
 *   content-following — controls sit directly beneath the artifact
 *                      (dice games). No bottom reservation is applied
 *                      and no geometry is subtracted.
 *
 * A game/phase may declare ONLY the mode and the row count. Row height,
 * inter-row gap and the cards→actions gap are shared tokens owned here.
 * There are deliberately no per-game heights, per-game percentages,
 * per-viewport percentages, or game-specific gaps in this module.
 *
 * Reservation formula (rows > 0):
 *   declaredRowsHeight = rows·ROW_H + (rows-1)·ROW_GAP
 *   declaredReservation = declaredRowsHeight + CARDS_TO_ACTIONS_GAP
 *   rows === 0  ⇒  declaredReservation = 0
 *
 * Measured escalation (bounded — reuses the lower-zone measurement
 * already proven in Gin Rummy):
 *   effective = max(declaredReservation, measuredLowerZonePx + safeAreaBottomPx)
 *
 * The cards→actions gap is NOT re-added to the measured term: a
 * rendered lower zone already carries its own top spacing in its box
 * (this is exactly how the proven Gin path behaves), so adding the
 * token again would double-count the clearance and silently shrink
 * Gin's card stage.
 *
 * The declared row count remains the canonical capacity contract;
 * measurement is an ESCALATION only (longer labels, font scaling,
 * accessibility sizing, safe-area insets) — never a replacement.
 */

import type { GameKey } from '@/lib/geometryLab/descriptorIndex';

// ── Shared tokens ───────────────────────────────────────────────────

/** Height of ONE canonical action row (button / status text). */
export const ACTION_ROW_HEIGHT_PX = 36;
/** Vertical gap between two stacked action rows. */
export const ACTION_ROW_GAP_PX = 8;
/** Gap between the card region and the top of the action strip. */
export const CARDS_TO_ACTIONS_GAP_PX = 8;

// ── Types ───────────────────────────────────────────────────────────

export type ActiveActionRowCount = 0 | 1 | 2 | 3;

export type ActiveActionLayout =
  | { mode: 'reserved-strip'; rows: ActiveActionRowCount }
  | { mode: 'content-following' };

export interface ActiveActionReservationInput {
  layout: ActiveActionLayout;
  /** Rendered height of every `[data-active-hand-lower-zone]` in the pane. */
  measuredLowerZonePx?: number;
  /** Resolved `env(safe-area-inset-bottom)` contribution in px. */
  safeAreaBottomPx?: number;
}

export interface ActiveActionReservation {
  mode: ActiveActionLayout['mode'];
  rows: ActiveActionRowCount;
  rowHeightPx: number;
  rowGapPx: number;
  cardsToActionsGapPx: number;
  declaredRowsHeightPx: number;
  declaredReservationPx: number;
  measuredLowerZonePx: number;
  safeAreaBottomPx: number;
  measuredReservationPx: number;
  effectiveReservationPx: number;
  /** True when measurement (not the declared contract) set the value. */
  escalated: boolean;
}

// ── Formulas ────────────────────────────────────────────────────────

const nonNeg = (n: number | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

export function resolveDeclaredRowsHeightPx(layout: ActiveActionLayout): number {
  if (layout.mode !== 'reserved-strip' || layout.rows <= 0) return 0;
  return layout.rows * ACTION_ROW_HEIGHT_PX + (layout.rows - 1) * ACTION_ROW_GAP_PX;
}

export function resolveDeclaredReservationPx(layout: ActiveActionLayout): number {
  const rowsHeight = resolveDeclaredRowsHeightPx(layout);
  return rowsHeight > 0 ? rowsHeight + CARDS_TO_ACTIONS_GAP_PX : 0;
}

export function resolveActiveActionReservation(
  input: ActiveActionReservationInput,
): ActiveActionReservation {
  const { layout } = input;
  const rows: ActiveActionRowCount = layout.mode === 'reserved-strip' ? layout.rows : 0;
  const measuredLowerZonePx = nonNeg(input.measuredLowerZonePx);
  const safeAreaBottomPx = nonNeg(input.safeAreaBottomPx);

  if (layout.mode !== 'reserved-strip') {
    // Content-following: no bottom reservation is ever applied.
    return {
      mode: 'content-following',
      rows: 0,
      rowHeightPx: ACTION_ROW_HEIGHT_PX,
      rowGapPx: ACTION_ROW_GAP_PX,
      cardsToActionsGapPx: CARDS_TO_ACTIONS_GAP_PX,
      declaredRowsHeightPx: 0,
      declaredReservationPx: 0,
      measuredLowerZonePx,
      safeAreaBottomPx,
      measuredReservationPx: 0,
      effectiveReservationPx: 0,
      escalated: false,
    };
  }

  const declaredRowsHeightPx = resolveDeclaredRowsHeightPx(layout);
  const declaredReservationPx = resolveDeclaredReservationPx(layout);
  const measuredReservationPx = measuredLowerZonePx + safeAreaBottomPx;
  const effectiveReservationPx = Math.max(declaredReservationPx, measuredReservationPx);

  return {
    mode: 'reserved-strip',
    rows,
    rowHeightPx: ACTION_ROW_HEIGHT_PX,
    rowGapPx: ACTION_ROW_GAP_PX,
    cardsToActionsGapPx: CARDS_TO_ACTIONS_GAP_PX,
    declaredRowsHeightPx,
    declaredReservationPx,
    measuredLowerZonePx,
    safeAreaBottomPx,
    measuredReservationPx,
    effectiveReservationPx,
    escalated: measuredReservationPx > declaredReservationPx,
  };
}

/**
 * Card region available to the artifact inside the active pane.
 * reserved-strip  → paneHeight − effectiveReservation
 * content-following → paneHeight (nothing subtracted)
 */
export function resolveCardRegionHeightPx(
  paneHeightPx: number,
  reservation: ActiveActionReservation,
): number {
  const paneH = nonNeg(paneHeightPx);
  if (reservation.mode !== 'reserved-strip') return paneH;
  return Math.max(0, paneH - reservation.effectiveReservationPx);
}

// ── Per-game / per-phase declarations ───────────────────────────────
//
// Only migrated surfaces declare a reserved strip. Every other game
// (Holm, 3-5-7, Yahtzee, Horses, SCC) resolves to `content-following`
// and therefore has ZERO geometry contribution from this module — the
// default is the harmless no-op required by the shared type.

const CONTENT_FOLLOWING: ActiveActionLayout = { mode: 'content-following' };
const ONE_ROW: ActiveActionLayout = { mode: 'reserved-strip', rows: 1 };

/**
 * Cribbage phase policy — see the migration note in
 * `CribbageMobileCardsTab`. Every active-hand phase reserves exactly
 * one row: each of them can render controls (`Send to Crib`) or active
 * status text (`Tap a card to play!`, `Waiting for opponent…`,
 * `Counting hands…`). Reserving one row throughout the active-hand
 * lifecycle is deliberately steadier than collapsing to `rows: 0`
 * between phases, which would produce a visible vertical jump on every
 * discard → pegging → counting boundary.
 */
export function resolveActiveActionLayout(
  game: GameKey | string,
  _phase?: string | null,
): ActiveActionLayout {
  switch (game) {
    case 'cribbage':
      return ONE_ROW;
    case 'ginRummy':
      return ONE_ROW;
    // Holm (Phase 2). The active-hand lower zone always renders exactly
    // one canonical row of content — Fold/Bet, the auto-fold checkbox,
    // STAYED/FOLDED presentation, Show Cards, rejoin, or waiting status.
    // The row is deliberately NOT collapsed to zero between transient
    // phases: every one of those states occupies the same strip, and
    // collapsing would produce a visible vertical jump of the fan on
    // each decision → showdown → terminal boundary.
    case 'holm':
      return ONE_ROW;
    default:
      return CONTENT_FOLLOWING;
  }
}

