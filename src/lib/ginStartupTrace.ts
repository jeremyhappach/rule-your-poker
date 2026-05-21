/**
 * Gin startup timeline tracer.
 *
 * Captures absolute timestamps + delta-from-t0 for every gating event on
 * the gin-rummy bootstrap critical path. t0 is set at markGinSubmit().
 *
 * In addition to console logging, this module retains an in-memory
 * ordered list of milestone events for the current startup run, exposed
 * via useGinMilestones() so the in-app yellow lifecycle debug badge can
 * render the timeline without depending on the browser console.
 *
 * Instrumentation only — no behavior changes.
 */

import { useSyncExternalStore } from 'react';

let _t0: number | null = null;
let _t0GameId: string | null = null;

export interface GinMilestone {
  label: string;
  dtMs: number;
}

let _milestones: GinMilestone[] = [];
const _seenLabels = new Set<string>();
const _listeners = new Set<() => void>();

function _emit() {
  _milestones = [..._milestones];
  for (const l of _listeners) l();
}

function _recordMilestone(label: string, dtMs: number) {
  if (_seenLabels.has(label)) return;
  _seenLabels.add(label);
  _milestones.push({ label, dtMs });
  _emit();
}

/**
 * Map raw ginTrace event names to short milestone labels. Only the
 * first occurrence per label is kept.
 */
function _matchMilestone(event: string, data?: Record<string, unknown>): string | null {
  if (event === 'T0 submit') return 'T0 submit';
  if (event === 'rounds.insert returned') return 'rounds persisted';
  if (event === 'off-critical writes dispatched (games + player_cards)') return 'games update dispatched';
  if (event === 'readiness probe: reporting ready=true') return 'probe ready';
  if (event === 'currentRound.id changed' && data && (data as any).next) return 'currentRound present';
  if (event === 'game.current_game_uuid changed' && data && (data as any).next) return 'current_game_uuid present';
  if (event === 'GinRummyGameTable mounted') return 'Gin mounted';
  // Slot controller events derived from snapshots below.
  return null;
}

export function markGinSubmit(gameId: string | null | undefined): void {
  _t0 = performance.now();
  _t0GameId = gameId ?? null;
  _milestones = [];
  _seenLabels.clear();
  _recordMilestone('T0 submit', 0);
  // eslint-disable-next-line no-console
  console.log('[GIN_RUNTIME_TIMELINE] T0 submit', {
    t0Abs: Date.now(),
    gameId: _t0GameId,
  });
}

export function ginTrace(event: string, data?: Record<string, unknown>): void {
  const now = performance.now();
  const dt = _t0 != null ? Math.round(now - _t0) : null;
  // eslint-disable-next-line no-console
  console.log(`[GIN_RUNTIME_TIMELINE] ${event}`, {
    tAbs: Date.now(),
    dtMs: dt,
    gameId: _t0GameId,
    ...(data ?? {}),
  });

  if (_t0 == null || dt == null) return;

  const label = _matchMilestone(event, data);
  if (label) _recordMilestone(label, dt);

  // Slot controller state snapshots → derive milestones.
  if (event === 'slot.state' && data) {
    const d = data as any;
    if (d.readyToMountProp === true) _recordMilestone('readyToMountProp=true', dt);
    if (d.surfaceReady === true) _recordMilestone('surfaceReady=true', dt);
  }
  if (event.startsWith('slot.dwell timer armed') || event.startsWith('slot.enter neutral')) {
    _recordMilestone('dwell armed', dt);
  }
  if (event.startsWith('slot.dwell elapsed')) {
    _recordMilestone('dwell elapsed', dt);
  }
  if (event === 'slot.MOUNT active') {
    _recordMilestone('slot mounted', dt);
  }
  if (event === 'slot.cold-start direct mount (ready)') {
    _recordMilestone('dwell armed', dt);
    _recordMilestone('dwell elapsed', dt);
    _recordMilestone('slot mounted', dt);
  }
}

export function getGinT0(): number | null {
  return _t0;
}

function _subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function useGinMilestones(): GinMilestone[] {
  return useSyncExternalStore(_subscribe, () => _milestones, () => _milestones);
}
