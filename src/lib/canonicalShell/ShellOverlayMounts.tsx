/**
 * ShellOverlayMounts — P8.0 named overlay mount points (scaffolding).
 *
 * Exposes four canonical overlay slots that later waves will route
 * game-owned overlays through:
 *   - celebration  (winner, gin, skunk, sweep)
 *   - settlement   (chip transfers, pot-to-player, legs-to-player)
 *   - announcement (dealer announcement, ante up, midnight, no-qualify)
 *   - slot         (game-internal reveals — showdown, cut card)
 *
 * P8.0 scope (zero visual change):
 *   - Mount points are rendered as empty <div> markers with stable
 *     data attributes. They have NO size, NO positioning, NO z-index.
 *   - No overlay is migrated in this phase. Existing overlays continue
 *     to render exactly where they do today.
 *
 * Future phases (P8.7+) will:
 *   - Wire React portals targeted by overlay-slot name
 *   - Add z-order discipline
 *   - Add hard-lock suppression signals (e.g. for observer affordances)
 *
 * Intentionally NOT mounted by `PersistentTableShell` in P8.0 — opt-in
 * by future consumers via direct composition, so no current code path
 * changes its DOM output.
 */

import { SHELL_OVERLAY_SLOTS, type ShellOverlaySlotName } from './GameplaySlotContract';

export interface ShellOverlayMountsProps {
  /** Optional gameId stamped onto mount nodes for diagnostics. */
  gameId?: string | null;
}

export function ShellOverlayMounts({ gameId }: ShellOverlayMountsProps) {
  return (
    <>
      {SHELL_OVERLAY_SLOTS.map((slot) => (
        <div
          key={slot}
          data-canonical-shell-overlay-mount={slot}
          data-shell-overlay-game-id={gameId ?? undefined}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export { SHELL_OVERLAY_SLOTS };
export type { ShellOverlaySlotName };
