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

  // Persist to DB (fire-and-forget, always — invariants bypass debug flag)
  try {
    import('./persistSyncDebugEvent').then(({ persistInvariantViolation }) => {
      const gameId = (context.gameId as string) ?? '';
      const handNumber = (context.handNumber as number) ?? 0;
      if (gameId) {
        persistInvariantViolation(gameId, game, handNumber, invariant, context);
      }
    }).catch(() => { /* safe */ });
  } catch { /* safe if module not available */ }

  return false;
}

/** Get recent violations for debug UI */
export function getRecentViolations(): readonly InvariantViolation[] {
  return recentViolations;
}

// ── State summary logger (removed — was console noise) ────────
// logSyncSummary and logSyncGateResult removed.
// Invariant violations (checkInvariant) remain the only diagnostic output.
