/**
 * Tiny process-wide signals for tracking client resume/realtime health.
 *
 * Owned by Game.tsx (writer). Read by diagnostic emitters (e.g. the
 * Cribbage interaction-gate blocked event) so they can attach
 * `msSinceVisibilityResume` and `realtimeStatus` without threading
 * props through the tree. No polling, no state, no side effects.
 */

let _lastVisibilityResumeAt: number | null = null;
let _realtimeStatus: string | null = null;

export function markVisibilityResume(): void {
  _lastVisibilityResumeAt = Date.now();
}

export function getMsSinceVisibilityResume(): number | null {
  if (_lastVisibilityResumeAt == null) return null;
  return Date.now() - _lastVisibilityResumeAt;
}

export function setRealtimeStatus(status: string | null): void {
  _realtimeStatus = status;
}

export function getRealtimeStatus(): string | null {
  return _realtimeStatus;
}
