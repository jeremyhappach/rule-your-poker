/**
 * Gin startup timeline tracer.
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
let _frozen = false;

// Live snapshot of latest slot.state — used to render current gate values
// in the badge while we wait for the cold-start branch to promote.
export interface GinLiveSnapshot {
  desiredIdentity: string | null;
  mountedIdentity: string | null;
  readyToMountProp: boolean | null;
  surfaceReady: boolean | null;
  readyToMount: boolean | null;
  phase: string | null;
  readinessScope: string | null;
  dealerGameId: string | null;
  currentRoundId: string | null;
  currentRoundDealerGameId: string | null;
  currentGameUuid: string | null;
}

let _live: GinLiveSnapshot = {
  desiredIdentity: null,
  mountedIdentity: null,
  readyToMountProp: null,
  surfaceReady: null,
  readyToMount: null,
  phase: null,
  readinessScope: null,
  dealerGameId: null,
  currentRoundId: null,
  currentRoundDealerGameId: null,
  currentGameUuid: null,
};
const _liveListeners = new Set<() => void>();
function _emitLive() {
  _live = { ..._live };
  for (const l of _liveListeners) l();
}

function _emit() {
  _milestones = [..._milestones];
  for (const l of _listeners) l();
}

function _recordMilestone(label: string, dtMs: number) {
  if (_frozen) return;
  if (_seenLabels.has(label)) return;
  _seenLabels.add(label);
  _milestones.push({ label, dtMs });
  if (label === 'GinRummyGameTable mounted') _frozen = true;
  _emit();
}

function _matchMilestone(event: string, data?: Record<string, unknown>): string | null {
  if (event === 'T0 submit') return 'T0 submit';
  if (event === 'startGinRummyRound:entered') return 'startGinRummyRound entered';
  if (event === 'rounds.insert returned') return 'round persisted';
  if (event === 'off-critical writes dispatched (games + player_cards)') return 'games update dispatched';
  if (event === 'readiness probe: reporting ready=true') return 'probe ready=true';
  if (event === 'currentRound.id changed' && data && (data as any).next) return 'currentRound present';
  if (event === 'game.current_game_uuid changed' && data && (data as any).next) return 'current_game_uuid present';
  if (event === 'GinRummyGameTable mounted') return 'GinRummyGameTable mounted';
  if (event === 'gin.first-render') return 'gin.first-render';
  if (event === 'gin.bootstrapState applied') return 'gin.bootstrapState applied';
  if (event === 'gin.hydration load:start') return 'gin.hydration load:start';
  if (event === 'gin.hydration load:applied') return 'gin.hydration load:applied';
  if (event === 'gin.hydration load:empty') return 'gin.hydration load:empty';
  if (event === 'gin.viewState ready (first non-null)') return 'gin.viewState ready';
  return null;
}

export function markGinSubmit(gameId: string | null | undefined): void {
  _t0 = performance.now();
  _t0GameId = gameId ?? null;
  _milestones = [];
  _seenLabels.clear();
  _frozen = false;
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

  // Slot controller snapshots → live values + gate milestones.
  if (event === 'slot.state' && data) {
    const d = data as any;
    _live.desiredIdentity = d.desiredIdentity ?? null;
    _live.mountedIdentity = d.mountedIdentity ?? null;
    _live.readyToMountProp = d.readyToMountProp ?? null;
    _live.surfaceReady = d.surfaceReady ?? null;
    _live.readyToMount = d.readyToMount ?? null;
    _live.phase = d.phase ?? null;
    _live.readinessScope = d.readinessScope ?? null;
    _live.dealerGameId = d.dealerGameId ?? null;
    _emitLive();

    if (d.desiredIdentity && d.desiredIdentity !== 'neutral') {
      _recordMilestone('desiredIdentity non-null', dt);
    }
    if (d.readyToMountProp === true) _recordMilestone('readyToMountProp=true', dt);
    if (d.surfaceReady === true) _recordMilestone('surfaceReady=true', dt);
  }

  // Game-level identity events update live snapshot too.
  if (event === 'currentRound.id changed' && data) {
    _live.currentRoundId = ((data as any).next as string) ?? null;
    _emitLive();
  }
  if (event === 'currentRound.dealer_game_id changed' && data) {
    _live.currentRoundDealerGameId = ((data as any).next as string) ?? null;
    _emitLive();
  }
  if (event === 'game.current_game_uuid changed' && data) {
    _live.currentGameUuid = ((data as any).next as string) ?? null;
    _emitLive();
  }

  if (event.startsWith('slot.dwell timer armed') || event.startsWith('slot.enter neutral')) {
    _recordMilestone('dwell armed', dt);
  }
  if (event.startsWith('slot.dwell elapsed')) {
    _recordMilestone('dwell elapsed', dt);
  }
  if (event === 'slot.MOUNT active') {
    _recordMilestone('slot.MOUNT active', dt);
  }
  if (event === 'slot.cold-start direct mount (ready)') {
    _recordMilestone('slot.MOUNT active', dt);
  }
  if (event === 'slot.cold-start hold neutral (awaiting-surface-ready)') {
    _recordMilestone('cold-start hold neutral', dt);
  }
}

export function getGinT0(): number | null {
  return _t0;
}

function _subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
function _subscribeLive(cb: () => void) {
  _liveListeners.add(cb);
  return () => _liveListeners.delete(cb);
}

export function useGinMilestones(): GinMilestone[] {
  return useSyncExternalStore(_subscribe, () => _milestones, () => _milestones);
}

export function useGinLiveSnapshot(): GinLiveSnapshot {
  return useSyncExternalStore(_subscribeLive, () => _live, () => _live);
}
