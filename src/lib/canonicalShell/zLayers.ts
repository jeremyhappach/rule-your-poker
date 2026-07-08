/**
 * Canonical shell z-layer contract.
 *
 * Named z-index bands for every shell-owned surface. Consumers MUST
 * import from this module rather than hardcoding magic z-index values.
 *
 * Ordering (lowest → highest):
 *
 *   FELT_BASE               0     Canonical felt paint host
 *   FELT_ARTIFACT          20     Artifacts painted on the felt (chip discs, seat clusters)
 *   PASSIVE_OVERLAY        30     Non-blocking waiting/setup/interstitial visual overlays.
 *                                 These MUST NOT capture pointer events over the tab rail.
 *   HUD_TAB_RAIL           40     Canonical shell tab bar. Sits above passive overlays,
 *                                 well below true blocking modals AND well below deal/chip
 *                                 transport so cards/chips visibly fly over the rail.
 *   CHIP_TRANSPORT         80     Chip transport runtime (existing).
 *   CARD_TRANSPORT         82     Card transport runtime / deal fly layer (existing).
 *   CELEBRATION            90     Shell-owned celebration overlay (match_win, etc.).
 *   MODAL_OVERLAY        9998     Radix DialogOverlay (true blocking modal scrim).
 *   MODAL_CONTENT        9999     Radix DialogContent (true blocking modal surface).
 *                                 The dealer-config / ante decision / etc. dialogs render
 *                                 here and MUST visually cover the tab rail.
 *   DIAGNOSTIC_PILL     2147483645+  Diagnostic pills / debug HUD.
 *
 * Rules:
 *   1. Any new shell surface picks the smallest band that satisfies its
 *      layering requirement — never `Number.MAX_SAFE_INTEGER` and never
 *      an ad-hoc value like 10000 to escape one specific problem.
 *   2. Pointer-events escape (e.g. Radix body-lock) is orthogonal to
 *      z-index. Fix pointer-events with `pointer-events: auto` on the
 *      opting-in element, not by promoting z-index globally.
 *   3. Deal/chip transport SIT ABOVE the tab rail on purpose — cards
 *      and chips must visibly cross the rail during flight.
 *   4. True blocking modals (Radix Dialog) SIT ABOVE transport — a
 *      dealer-action modal must never be occluded by an in-flight card.
 */
export const SHELL_Z = {
  FELT_BASE: 0,
  FELT_ARTIFACT: 20,
  PASSIVE_OVERLAY: 30,
  HUD_TAB_RAIL: 40,
  CHIP_TRANSPORT: 80,
  CARD_TRANSPORT: 82,
  CELEBRATION: 90,
  MODAL_OVERLAY: 9998,
  MODAL_CONTENT: 9999,
  DIAGNOSTIC_PILL: 2147483645,
} as const;

export type ShellZLayer = keyof typeof SHELL_Z;
