/**
 * Reusable invariant-checking + state-summary logging framework
 * for multiplayer sync diagnostics.
 *
 * All output uses consistent prefixes for easy grep:
 *   [sync-invariant]  — invariant violation (always fires, even if not visible)
 *   [sync-race]       — race harness events (see debugRaceHarness.ts)
 *   [{game}-sync]     — per-game state summaries (e.g. [holm-sync])
 *
 * Toggle via:
 *   - URL param:  ?debug_sync_invariants=1
 *   - localStorage: ptp_debug_sync_invariants = "1"
 *
 * Invariant violations ALWAYS log (regardless of toggle) because they
 * represent impossible states that must be caught.
 */

// ── Toggle (for verbose summaries; violations always fire) ────

let _verboseEnabled: boolean | null = null;

function checkVerbose(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug_sync_invariants');
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    if (window.localStorage.getItem('ptp_debug_sync_invariants') === '1') return true;
  } catch { /* */ }
  return false;
}

export function isSyncInvariantVerbose(): boolean {
  if (_verboseEnabled === null) _verboseEnabled = checkVerbose();
  return _verboseEnabled;
}

export function refreshSyncInvariantFlag(): void {
  _verboseEnabled = checkVerbose();
}

// ── Invariant check ───────────────────────────────────────────

export interface InvariantViolation {
  game: string;
  invariant: string;
  message: string;
  context: Record<string, unknown>;
}

const recentViolations: InvariantViolation[] = [];
const MAX_RECENT = 50;

/**
 * Check an invariant condition. If `condition` is false, logs a violation.
 * Violations ALWAYS log regardless of debug toggle.
 *
 * Returns true if invariant holds, false if violated.
 */
export function checkInvariant(
  game: string,
  invariant: string,
  condition: boolean,
  message: string,
  context: Record<string, unknown> = {},
): boolean {
  if (condition) return true;

  const violation: InvariantViolation = { game, invariant, message, context };

  console.error(`[sync-invariant] ❌ ${game}::${invariant} — ${message}`, context);

  recentViolations.push(violation);
  if (recentViolations.length > MAX_RECENT) recentViolations.shift();

  return false;
}

/** Get recent violations for debug UI */
export function getRecentViolations(): readonly InvariantViolation[] {
  return recentViolations;
}

// ── State summary logger ──────────────────────────────────────

/**
 * Log a compact state summary for a game. Only fires when verbose mode is on.
 *
 * @param prefix  e.g. 'holm-sync', 'gin-sync'
 * @param label   e.g. 'accepted', 'rejected', 'render', 'result'
 * @param summary compact object with key state dimensions
 */
export function logSyncSummary(
  prefix: string,
  label: string,
  summary: Record<string, unknown>,
): void {
  if (!isSyncInvariantVerbose()) return;
  console.log(`[${prefix}] 📊 ${label}`, summary);
}

/**
 * Log an accepted/rejected authoritative update with progress info.
 */
export function logSyncGateResult(
  prefix: string,
  accepted: boolean,
  reason: string,
  progress: {
    current: unknown;
    incoming: unknown;
  },
  extra?: Record<string, unknown>,
): void {
  if (!isSyncInvariantVerbose()) return;
  const icon = accepted ? '✅' : '❌';
  console.log(`[${prefix}] ${icon} ${accepted ? 'Accepted' : 'Rejected'} (${reason})`, {
    ...progress,
    ...extra,
  });
}
