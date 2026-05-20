/**
 * ShellPreHandSurface — P9.5
 *
 * Shell-owned persistent pre-hand visual floor. Renders the canonical
 * felt surface continuously while a gameplay slot is mounted, so the
 * viewport is never blank between (a) slot mount and (b) the first
 * authoritative gameplay viewState.
 *
 * Architectural contract:
 *   - Owned by `canonicalShell/`. Not a generic UI container.
 *   - Driven by a typed intent (see PersistentTableShell.preHandIntent),
 *     NOT by injected JSX. Lifecycle ownership stays in the shell.
 *   - Pure presentation. No gameplay layout assumptions. No knowledge
 *     of round state, viewState, or per-game internals.
 *   - Sits BELOW the gameplay slot in z-order. Gameplay paints on top
 *     once viewState exists. Felt persists; no remount / no flicker.
 *
 * Out of scope (deferred):
 *   - Seat plates: gameplay-positioned; rendered by the game body once
 *     viewState arrives. Including them here would duplicate per-game
 *     layout logic.
 *   - Lifecycle messaging ("Awaiting ante" / "Preparing hand").
 */

import { CanonicalFeltSurface, type CanonicalFeltGameKind } from "./CanonicalFeltSurface";

export interface PreHandIntent {
  gameKind: CanonicalFeltGameKind;
  anteAmount: number | string;
  pointsToWin?: number;
  potMaxEnabled?: boolean;
  potMaxValue?: number | string;
  legsToWin?: number;
}

export interface ShellPreHandSurfaceProps {
  intent: PreHandIntent;
}

export function ShellPreHandSurface({ intent }: ShellPreHandSurfaceProps) {
  return (
    <div
      data-canonical-shell-pre-hand-surface=""
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {/* Felt floor — same component the game body uses, so the visual
          is identical and there is no swap/flash when gameplay mounts
          on top. */}
      <div className="absolute inset-x-0 top-0 h-[55vh] overflow-hidden">
        <CanonicalFeltSurface
          gameKind={intent.gameKind}
          anteAmount={intent.anteAmount}
          pointsToWin={intent.pointsToWin}
          potMaxEnabled={intent.potMaxEnabled}
          potMaxValue={intent.potMaxValue}
          legsToWin={intent.legsToWin}
          isWaitingPhase
        />
      </div>
    </div>
  );
}
