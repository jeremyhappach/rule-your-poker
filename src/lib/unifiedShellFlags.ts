/**
 * Feature flags for the Unified Game Table Architecture rollout.
 *
 * All flags default OFF in production. Enable per-session via URL params or
 * localStorage so we can A/B against the legacy behavior without redeploying.
 *
 * Phase 1 — killStatusKey:
 *   Drops the `${game.status}` segment from the `MobileGameTable` key at
 *   Game.tsx (the status-keyed game_selection/configuring/game_over branch).
 *   When ON, that branch stops physically remounting on every status flip.
 *
 *   Enable via:
 *     ?unified_kill_status_key=1
 *     localStorage: ptp_unified_kill_status_key = "1"
 */

function hasQueryFlag(name: string): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(name);
    if (v === null) return false;
    return v === '' || v === '1' || v.toLowerCase() === 'true';
  } catch {
    return false;
  }
}

function hasLocalFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function isKillStatusKeyEnabled(): boolean {
  return (
    hasQueryFlag('unified_kill_status_key') ||
    hasLocalFlag('ptp_unified_kill_status_key')
  );
}
