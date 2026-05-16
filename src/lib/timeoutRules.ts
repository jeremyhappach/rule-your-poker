/**
 * Authoritative runtime predicate for "is timeout-driven auto-fold a valid
 * participation action for this ruleset?"
 *
 * This is the single source of truth used by every automated writer
 * (client timer fallback, autoFoldUndecided, cron participation evaluators).
 *
 * Currently only Holm and 3-5-7 variants treat decision-timer expiry as an
 * auto-fold of the player's hand. Cribbage, Gin Rummy, Yahtzee, Horses, SCC
 * have their own timer semantics (e.g. horses auto-rolls; cribbage has no
 * fold-on-timeout) and MUST NOT be touched by autoFoldUndecided or the
 * cron's "auto_fold → sitting_out" conversion.
 *
 * If the ruleset model gains explicit "timeoutAction" flags later, extend
 * this predicate to read them; callers will not need to change.
 */
export type TimeoutAction = 'auto_fold' | 'auto_sit_out';

export function gameTypeAllowsTimeoutAction(
  gameType: string | null | undefined,
  action: TimeoutAction
): boolean {
  if (!gameType) return false;
  const gt = String(gameType).toLowerCase();
  const isHolm = gt === 'holm-game' || gt === 'holm';
  const is357 = gt === '3-5-7' || gt === '3-5-7-game' || gt === '357';
  if (action === 'auto_fold') return isHolm || is357;
  if (action === 'auto_sit_out') return isHolm || is357;
  return false;
}

/**
 * Validates that an automated timeout-driven auto-fold may proceed for a
 * given (game, round) snapshot. Returns a suppression reason string when
 * the action MUST be suppressed, or null when it is safe to proceed.
 *
 * Caller is expected to re-fetch authoritative state immediately before
 * calling this — never trust cached snapshots.
 */
export function validateTimeoutAutoFold(args: {
  game: { game_type?: string | null; status?: string | null; is_paused?: boolean | null } | null;
  round: { id?: string | null; decision_deadline?: string | null; status?: string | null } | null;
  expectedRoundId?: string | null;
  expectedHandNumber?: number | null;
  expectedRoundNumber?: number | null;
  roundHandNumber?: number | null;
  roundRoundNumber?: number | null;
  nowMs?: number;
}): string | null {
  const now = args.nowMs ?? Date.now();
  if (!args.game) return 'no-game';
  if (!gameTypeAllowsTimeoutAction(args.game.game_type, 'auto_fold')) {
    return 'invalid-ruleset';
  }
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
