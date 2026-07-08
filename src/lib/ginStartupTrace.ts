/**
 * Gin startup timeline tracer — RETIRED.
 *
 * The Gin startup investigation is complete. All entry points are
 * no-ops so existing call sites compile without producing any runtime
 * work: no console output, no startup flight recorder writes, no
 * milestone bookkeeping, no listener notifications.
 *
 * The consuming UI overlays (LifecycleDebugBadge etc.) already gate on
 * an off-by-default localStorage flag; with these hooks returning
 * frozen empty snapshots, no timeline data is ever produced.
 */

export interface GinMilestone {
  label: string;
  dtMs: number;
}

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

const EMPTY_MILESTONES: GinMilestone[] = [];
const EMPTY_LIVE: GinLiveSnapshot = {
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

export function getGinTimelineText(): string {
  return '(gin timeline disabled)';
}

export function markGinSubmit(_gameId: string | null | undefined): void {}

export function ginTrace(_event: string, _data?: Record<string, unknown>): void {}

export function getGinT0(): number | null {
  return null;
}

export function useGinMilestones(): GinMilestone[] {
  return EMPTY_MILESTONES;
}

export function useGinLiveSnapshot(): GinLiveSnapshot {
  return EMPTY_LIVE;
}
