/**
 * ActionStripSlot — Wave 2F.1 primitive.
 *
 * Owns the canonical reservation contract for an action strip:
 *
 *   • Fixed `min-height` from `ACTION_STRIP_RESERVE_PX` so that swapping
 *     children between a button row, a replacement badge, a status pill,
 *     or a checkbox row never reflows the sibling above.
 *
 *   • Centered flex container with stable gap and wrap behaviour so
 *     1-button → 2-button → 3-button rows do not shift the active
 *     artifact horizontally.
 *
 *   • A single rendered slot per active pane. Consumers should render
 *     exactly one ActionStripSlot and put all conditional variants
 *     *inside* it, rather than rendering multiple sibling slots — this
 *     is what prevents "active-artifact hopping" between independent
 *     conditional blocks.
 *
 * This component is purely presentational. No game logic, no sync, no
 * geometry algorithm. The reservation height is the contract.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  resolveActionStripReservePx,
  resolveActionStripGapPx,
  resolveActionStripInlinePaddingPx,
  type ActionStripDensity,
} from "@/lib/canonicalShell/actionStripTokens";

export interface ActionStripSlotProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /**
   * Density tier. Defaults to `compact` (phone / unified mobile path).
   */
  density?: ActionStripDensity;
  /**
   * The single active variant rendered inside the slot. Consumers
   * should resolve their conditional state *above* the slot and pass
   * exactly one node — typically an ActionStripButtonRow,
   * ActionStripBadge, ActionStripStatusPill, or ActionStripCheckboxRow.
   *
   * Passing `null` is legal and preserves the reservation, keeping the
   * sibling layout above stable across empty/transitional states.
   */
  children?: React.ReactNode;
}

export const ActionStripSlot = React.forwardRef<
  HTMLDivElement,
  ActionStripSlotProps
>(({ density = "compact", className, style, children, ...rest }, ref) => {
  const reservePx = resolveActionStripReservePx(density);
  const gapPx = resolveActionStripGapPx(density);
  const inlinePadPx = resolveActionStripInlinePaddingPx(density);

  return (
    <div
      ref={ref}
      data-canonical-action-strip-slot=""
      data-action-strip-density={density}
      className={cn(
        "flex items-center justify-center flex-wrap w-full",
        className,
      )}
      style={{
        minHeight: reservePx,
        gap: gapPx,
        paddingInline: inlinePadPx,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});
ActionStripSlot.displayName = "ActionStripSlot";
