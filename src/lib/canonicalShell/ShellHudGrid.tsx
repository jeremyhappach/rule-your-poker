/**
 * ShellHudGrid — shell-owned proportional HUD-row grid (Phase 2).
 *
 * Authoritative 5-row partition of the HUD region (`--shell-hud-h`).
 * Every row is a fixed proportional share of the HUD region computed
 * by `--hud-h-*` tokens in index.css. No row is intrinsic-height.
 * Every row clips its own overflow.
 *
 * Contract (Phase 2):
 *   row 1 — announcement rail   (--hud-h-announcement)  shell-owned
 *   row 2 — timer / operational (--hud-h-timer)         game-supplied
 *   row 3 — tab rail            (--hud-h-tabs)          shell-owned
 *   row 4 — active pane         (--hud-h-pane)          game-supplied
 *   row 5 — identity            (--hud-h-identity)      game-supplied
 *
 * Invariants (DO NOT relax):
 *   - All 5 rows are ALWAYS rendered, even when their content is empty.
 *     Composition is identical across games; deterministic geometry is
 *     more important than reclaiming a small amount of whitespace.
 *     No game-specific row collapse, no opt-out, no conditional skip.
 *   - ACTIVE-PANE ROW 4 CONTAINMENT RULE (explicit):
 *     Active-pane content (`pane` slot) may not render outside row 4.
 *     If content does not fit, the pane MUST scale it, abbreviate it,
 *     clip it, or paginate it. It MAY NOT consume row 5 (identity),
 *     push the identity row down, or otherwise grow the HUD layout.
 *     The same containment applies to every other slot for its own row.
 *   - No `flex-1`, `auto`, `fr`, `min-h-0`, or `flex-grow` inside the
 *     grid. Each row's height is exactly `var(--hud-h-*)`.
 *
 * Ratio defaults live in index.css and are validated empirically per
 * device class. Retune the shared tokens (never per-surface) if a row
 * consistently clips on a real device.
 */

import { useRef, type ReactNode } from 'react';
import { ShellAnnouncementRail } from './ShellHudChrome';
import { ShellTabBar } from './ShellTabBar';
import { useLifecycleMount } from './lifecycleDebug';
import { useUnmountSnapshot } from './shellLifecycleLog';
import { getLifecycleContext } from './lifecycleDebug';
import { useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';
import { HudStackTraceProbe } from './HudStackTraceProbe';

export interface ShellHudGridProps {
  /** Row 2 — operational HUD chrome (timer chips, paused badge). */
  timer?: ReactNode;
  /** Row 4 — active pane (cards / scorecard / dice / chat / lobby). */
  pane?: ReactNode;
  /** Row 5 — player identity (name, chips, emoticon picker). */
  identity?: ReactNode;
}

const ROW_STYLE: React.CSSProperties = {
  overflow: 'hidden',
  minHeight: 0,
  position: 'relative',
};

export function ShellHudGrid({ timer, pane, identity }: ShellHudGridProps) {
  useLifecycleMount('ShellHudGrid');
  const _ctx = getLifecycleContext();
  useStartupMountTrace('ShellHudGrid', { gameType: _ctx.gameType, gameStatus: _ctx.gameStatus });
  useStartupRenderTrace('ShellHudGrid', {
    hasTimerSlot: timer != null,
    hasPaneSlot: pane != null,
    hasIdentitySlot: identity != null,
    gameType: _ctx.gameType,
    gameStatus: _ctx.gameStatus,
    dealerGameId: _ctx.dealerGameId,
    roundId: _ctx.roundId,
  }, { file: 'src/lib/canonicalShell/ShellHudGrid.tsx' });
  useUnmountSnapshot('ShellHudGrid', {
    parent: 'gameplay-surface(GinRummyGameTable/CribbageMobileGameTable/MobileGameTable)',
    gameType: _ctx.gameType,
    gameStatus: _ctx.gameStatus,
    dealerGameId: _ctx.dealerGameId,
    roundId: _ctx.roundId,
    feltOwnership: _ctx.feltOwnership,
    hasTimerSlot: timer != null,
    hasPaneSlot: pane != null,
    hasIdentitySlot: identity != null,
  });
  const hasTimer = timer != null;
  const gridRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={gridRef}
      data-canonical-shell-hud-grid=""
      data-hud-timer-present={hasTimer ? '1' : '0'}
      style={{
        height: 'var(--shell-hud-h)',
        flex: '0 0 var(--shell-hud-h)',
        display: 'grid',
        // GEOMETRY CONTRACT — rows own geometry; content occupies rows.
        // The timer row is ALWAYS reserved, even when no timer content is
        // published this frame. Conditional collapse was a contract
        // violation: when `hasTimer` flipped between lifecycle states
        // (decision pending → resolved, paused toggling, announcement
        // open/close), the pane row absorbed `--hud-h-timer` and the
        // active-player hand re-resolved to a different geometry,
        // producing visible card hopping. Holding all five row tracks
        // constant guarantees gameplay artifacts do not move when
        // higher-row content appears/disappears.
        gridTemplateRows:
          'var(--hud-h-announcement) var(--hud-h-tabs) ' +
          'var(--hud-h-timer) var(--hud-h-pane) var(--hud-h-identity)',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div data-hud-row="announcement" style={ROW_STYLE}>
        <ShellAnnouncementRail />
      </div>
      <div data-hud-row="tabs" style={ROW_STYLE}>
        <ShellTabBar />
      </div>
      <div data-hud-row="timer" style={ROW_STYLE}>
        {hasTimer ? timer : null}
      </div>
      <div data-hud-row="pane" style={ROW_STYLE}>
        {pane ?? null}
      </div>
      <div data-hud-row="identity" style={ROW_STYLE}>
        {identity ?? null}
      </div>
      <HudStackTraceProbe gridRef={gridRef} />
    </div>
  );
}
