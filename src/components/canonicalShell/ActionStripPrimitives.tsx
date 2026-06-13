/**
 * Action Strip variants — Wave 2F.1 primitives.
 *
 * Four presentational variants that share the canonical reservation
 * contract enforced by ActionStripSlot:
 *
 *   • ActionStripButtonRow    — 1–3 transient action buttons.
 *   • ActionStripBadge        — replacement badge (e.g. "Locked In",
 *                                "STAYED", "Pick a category").
 *   • ActionStripStatusPill   — informational text-only line
 *                                (e.g. "Waiting for opponent…").
 *   • ActionStripCheckboxRow  — persistent toggle row (e.g. Holm
 *                                Auto-fold). Note: persistent toggles
 *                                typically sit *adjacent to* an
 *                                ActionStripSlot rather than inside it,
 *                                because their semantics differ from a
 *                                transient action — they do not
 *                                participate in the button/badge/pill
 *                                swap. The primitive is exposed here
 *                                for the (rare) case where a consumer
 *                                wants a checkbox inside the active
 *                                reservation.
 *
 * No sizing math. Heights match the slot reservation via `h-full`
 * inside a flex container, plus a fixed inner button/pill height that
 * matches `Button size="sm"`.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Button row                                                                */
/* -------------------------------------------------------------------------- */

export interface ActionStripButtonRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 1–3 buttons. Consumers pass `<Button size="sm" />` elements (or
   * equivalent). The row enforces centered alignment and a stable gap
   * so the number of buttons does not shift the visible centroid.
   */
  children: React.ReactNode;
}

export const ActionStripButtonRow = React.forwardRef<
  HTMLDivElement,
  ActionStripButtonRowProps
>(({ className, children, ...rest }, ref) => (
  <div
    ref={ref}
    data-action-strip-variant="button-row"
    className={cn("flex items-center justify-center gap-2", className)}
    {...rest}
  >
    {children}
  </div>
));
ActionStripButtonRow.displayName = "ActionStripButtonRow";

/* -------------------------------------------------------------------------- */
/*  Replacement badge                                                          */
/* -------------------------------------------------------------------------- */

export interface ActionStripBadgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Optional visual tone. Purely presentational; consumers may also
   * pass `className` to override.
   */
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}

const BADGE_TONE_CLASS: Record<NonNullable<ActionStripBadgeProps["tone"]>, string> = {
  neutral: "bg-muted text-foreground",
  success: "bg-emerald-600/90 text-white",
  warning: "bg-amber-600/90 text-white",
  danger: "bg-red-600/90 text-white",
  info: "bg-sky-600/90 text-white",
};

export const ActionStripBadge = React.forwardRef<
  HTMLDivElement,
  ActionStripBadgeProps
>(({ tone = "neutral", className, children, ...rest }, ref) => (
  <div
    ref={ref}
    data-action-strip-variant="badge"
    className={cn(
      "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-semibold",
      BADGE_TONE_CLASS[tone],
      className,
    )}
    {...rest}
  >
    {children}
  </div>
));
ActionStripBadge.displayName = "ActionStripBadge";

/* -------------------------------------------------------------------------- */
/*  Status pill (informational text)                                          */
/* -------------------------------------------------------------------------- */

export interface ActionStripStatusPillProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Soft emphasis tier. `muted` for passive waits, `prompt` for active
   * "tap something" prompts (animated pulse).
   */
  emphasis?: "muted" | "prompt";
  children: React.ReactNode;
}

export const ActionStripStatusPill = React.forwardRef<
  HTMLDivElement,
  ActionStripStatusPillProps
>(({ emphasis = "muted", className, children, ...rest }, ref) => (
  <p
    ref={ref as unknown as React.Ref<HTMLParagraphElement>}
    data-action-strip-variant="status-pill"
    data-action-strip-emphasis={emphasis}
    className={cn(
      "text-sm m-0",
      emphasis === "muted" && "text-muted-foreground",
      emphasis === "prompt" && "text-poker-gold font-medium animate-pulse",
      className,
    )}
    {...rest}
  >
    {children}
  </p>
));
ActionStripStatusPill.displayName = "ActionStripStatusPill";

/* -------------------------------------------------------------------------- */
/*  Checkbox row (persistent toggle)                                          */
/* -------------------------------------------------------------------------- */

export interface ActionStripCheckboxRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The checkbox control (consumers pass a shadcn `<Checkbox />` or
   * native control). The primitive only owns layout, not the input.
   */
  control: React.ReactNode;
  /** Accessible label rendered next to the control. */
  label: React.ReactNode;
  /** Optional id used to associate the label with the control. */
  htmlFor?: string;
}

export const ActionStripCheckboxRow = React.forwardRef<
  HTMLDivElement,
  ActionStripCheckboxRowProps
>(({ control, label, htmlFor, className, ...rest }, ref) => (
  <div
    ref={ref}
    data-action-strip-variant="checkbox-row"
    className={cn(
      "inline-flex items-center justify-center gap-2 text-sm",
      className,
    )}
    {...rest}
  >
    {control}
    <label htmlFor={htmlFor} className="select-none text-foreground">
      {label}
    </label>
  </div>
));
ActionStripCheckboxRow.displayName = "ActionStripCheckboxRow";
