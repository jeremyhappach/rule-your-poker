/**
 * Action Strip — canonical reservation tokens (Wave 2F.1).
 *
 * Single source of truth for the vertical footprint of an action strip
 * (button row, replacement badge, status pill, checkbox row). Every
 * action-strip variant MUST share the same minimum height so that
 * swapping between {buttons ↔ badge ↔ pill} never reflows the sibling
 * above (cards, dice, score rail, etc.).
 *
 * The token is intentionally re-exported from `useCardRowLayout` rather
 * than duplicated. `useCardRowLayout` already owns the contract for
 * 3-5-7; this file canonicalizes the surface for action-strip primitives
 * without modifying the resolver per Wave 2F.1 constraints.
 *
 * No sizing algorithm lives here. No width budget lives here. Only the
 * reservation contract.
 */
import { ACTION_STRIP_RESERVE_PX as RESOLVER_TOKEN } from "./useCardRowLayout";

/**
 * Vertical reservation, in CSS pixels, for the action-strip slot.
 *
 * - `compact`   — phone / narrow tablet portrait.
 * - `comfortable` — tablet landscape / large viewports.
 *
 * Values are inclusive of button height + the ~8px container breathing
 * room used by the existing 3-5-7 strip, so badge/pill replacements
 * align exactly with the button-row height.
 */
export const ACTION_STRIP_RESERVE_PX = RESOLVER_TOKEN;

/**
 * Horizontal gap between sibling items inside an action-strip variant
 * (buttons within a row, label + control within a checkbox row, etc.).
 *
 * Fixed token, not budget-derived.
 */
export const ACTION_STRIP_GAP_PX = {
  compact: 8,
  comfortable: 12,
} as const;

/**
 * Inline horizontal padding applied by the slot container, so badge and
 * pill text never touches the pane edge.
 */
export const ACTION_STRIP_INLINE_PADDING_PX = {
  compact: 8,
  comfortable: 12,
} as const;

export type ActionStripDensity = keyof typeof ACTION_STRIP_RESERVE_PX;

/**
 * Resolve the reservation height for a given density. Centralises the
 * lookup so consumers (and the slot primitive) never index the token
 * record directly.
 */
export const resolveActionStripReservePx = (
  density: ActionStripDensity = "compact",
): number => ACTION_STRIP_RESERVE_PX[density];

export const resolveActionStripGapPx = (
  density: ActionStripDensity = "compact",
): number => ACTION_STRIP_GAP_PX[density];

export const resolveActionStripInlinePaddingPx = (
  density: ActionStripDensity = "compact",
): number => ACTION_STRIP_INLINE_PADDING_PX[density];
