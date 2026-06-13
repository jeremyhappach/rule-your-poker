/**
 * Barrel export for Wave 2F.1 action-strip primitives.
 * Consumers (Wave 2F.2+) should import from this barrel rather than
 * reaching into individual files.
 */
export { ActionStripSlot } from "./ActionStripSlot";
export type { ActionStripSlotProps } from "./ActionStripSlot";

export {
  ActionStripButtonRow,
  ActionStripBadge,
  ActionStripStatusPill,
  ActionStripCheckboxRow,
} from "./ActionStripPrimitives";
export type {
  ActionStripButtonRowProps,
  ActionStripBadgeProps,
  ActionStripStatusPillProps,
  ActionStripCheckboxRowProps,
} from "./ActionStripPrimitives";

export {
  ACTION_STRIP_RESERVE_PX,
  ACTION_STRIP_GAP_PX,
  ACTION_STRIP_INLINE_PADDING_PX,
  resolveActionStripReservePx,
  resolveActionStripGapPx,
  resolveActionStripInlinePaddingPx,
  type ActionStripDensity,
} from "@/lib/canonicalShell/actionStripTokens";
