/**
 * Runtime, config-backed timeout policy.
 *
 * The authoritative policy lives in the database:
 *   1. games.timeout_enforcement_enabled / games.timeout_action  (session-level override; NULL = inherit)
 *   2. game_defaults.timeout_enforcement_enabled / .timeout_action  (per-ruleset default)
 *   3. safe default: { enabled: false, action: 'none' }
 *
 * `resolveTimeoutPolicy` is the ONLY thing any automated timeout writer
 * (client timer, autoFoldUndecided, enforce-deadlines, enforce-all-deadlines,
 * game-over participation evaluator) should consult before mutating
 * participation state. No game-type allowlists remain.
 *
 * If a future ruleset is added (or an existing one reconfigured), the only
 * change is a row in `game_defaults` — no code edits required.
 */

export type TimeoutAction = 'none' | 'auto_fold' | 'auto_sit_out' | 'auto_roll';

export interface TimeoutPolicy {
  enabled: boolean;
  action: TimeoutAction;
  source: 'game' | 'game_default' | 'safe_default';
}

interface GameRowLike {
  game_type?: string | null;
  timeout_enforcement_enabled?: boolean | null;
  timeout_action?: string | null;
}

interface GameDefaultLike {
  timeout_enforcement_enabled?: boolean | null;
  timeout_action?: string | null;
}

const ALLOWED: ReadonlySet<TimeoutAction> = new Set<TimeoutAction>([
  'none', 'auto_fold', 'auto_sit_out', 'auto_roll',
]);

function coerceAction(v: unknown): TimeoutAction | null {
  if (typeof v !== 'string') return null;
  return (ALLOWED.has(v as TimeoutAction) ? (v as TimeoutAction) : null);
}

export function resolveTimeoutPolicy(
  game: GameRowLike | null | undefined,
  gameDefault: GameDefaultLike | null | undefined,
): TimeoutPolicy {
  // 1. Session-level override on games row
  if (game) {
    const a = coerceAction(game.timeout_action);
    const e = game.timeout_enforcement_enabled;
    if (a !== null && (e === true || e === false)) {
      return { enabled: !!e, action: a, source: 'game' };
    }
  }
  // 2. Ruleset default
  if (gameDefault) {
    const a = coerceAction(gameDefault.timeout_action);
    const e = gameDefault.timeout_enforcement_enabled;
    if (a !== null && (e === true || e === false)) {
      return { enabled: !!e, action: a, source: 'game_default' };
    }
  }
  // 3. Safe default: never act on missing config
  return { enabled: false, action: 'none', source: 'safe_default' };
}

/**
 * Validates that an automated auto-fold mutation may proceed.
 * Caller MUST pass freshly re-fetched `game` and `round` snapshots and the
 * policy resolved from authoritative config (resolveTimeoutPolicy).
 * Returns a suppression reason string when the action must be suppressed,
 * or null when it is safe to proceed.
 */
export function validateTimeoutAutoFold(args: {
  policy: TimeoutPolicy;
  game: { status?: string | null; is_paused?: boolean | null } | null;
  round: { id?: string | null; decision_deadline?: string | null; status?: string | null } | null;
  expectedRoundId?: string | null;
  expectedHandNumber?: number | null;
  expectedRoundNumber?: number | null;
  roundHandNumber?: number | null;
  roundRoundNumber?: number | null;
  nowMs?: number;
}): string | null {
  if (!args.policy.enabled) return 'policy-enforcement-disabled';
  if (args.policy.action !== 'auto_fold') return `policy-action-${args.policy.action}`;
  const now = args.nowMs ?? Date.now();
  if (!args.game) return 'no-game';
  if (args.game.is_paused) return 'game-paused';
  if (args.game.status !== 'in_progress') return 'game-not-in-progress';
  if (!args.round) return 'no-round';
  if (args.round.status !== 'betting') return 'round-not-in-decision-phase';
  if (!args.round.decision_deadline) return 'no-live-deadline';
  const deadlineMs = new Date(args.round.decision_deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return 'invalid-deadline';
  if (deadlineMs > now) return 'deadline-not-expired';
  if (args.expectedRoundId && args.round.id && args.expectedRoundId !== args.round.id) {
    return 'round-identity-mismatch';
  }
  if (
    args.expectedHandNumber != null &&
    args.roundHandNumber != null &&
    args.expectedHandNumber !== args.roundHandNumber
  ) {
    return 'hand-identity-mismatch';
  }
  if (
    args.expectedRoundNumber != null &&
    args.roundRoundNumber != null &&
    args.expectedRoundNumber !== args.roundRoundNumber
  ) {
    return 'round-number-identity-mismatch';
  }
  return null;
}
