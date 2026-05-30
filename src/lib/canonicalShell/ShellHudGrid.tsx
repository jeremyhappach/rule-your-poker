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
 *   - Game content may not render outside its assigned row. If content
 *     does not fit, scale it, abbreviate it, clip it, or paginate it —
 *     do NOT consume an adjacent row or push the HUD layout.
 *   - No `flex-1`, `auto`, `fr`, `min-h-0`, or `flex-grow` inside the
 *     grid. Each row's height is exactly `var(--hud-h-*)`.
 *
 * Ratio defaults live in index.css and are validated empirically per
 * device class. Retune the shared tokens (never per-surface) if a row
 * consistently clips on a real device.
 */

import type { ReactNode } from 'react';
import { ShellAnnouncementRail } from './ShellHudChrome';
import { ShellTabBar } from './ShellTabBar';

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
  return (
    <div
      data-canonical-shell-hud-grid=""
      style={{
        height: 'var(--shell-hud-h)',
        flex: '0 0 var(--shell-hud-h)',
        display: 'grid',
        gridTemplateRows:
          'var(--hud-h-announcement) var(--hud-h-timer) ' +
          'var(--hud-h-tabs) var(--hud-h-pane) var(--hud-h-identity)',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div data-hud-row="announcement" style={ROW_STYLE}>
        <ShellAnnouncementRail />
      </div>
      <div data-hud-row="timer" style={ROW_STYLE}>
        {timer ?? null}
      </div>
      <div data-hud-row="tabs" style={ROW_STYLE}>
        <ShellTabBar />
      </div>
      <div data-hud-row="pane" style={ROW_STYLE}>
        {pane ?? null}
      </div>
      <div data-hud-row="identity" style={ROW_STYLE}>
        {identity ?? null}
      </div>
    </div>
  );
}
