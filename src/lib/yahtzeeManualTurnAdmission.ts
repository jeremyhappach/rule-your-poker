export interface YahtzeeManualTurnAdmission {
  gamePhase: string;
  isMyTurn: boolean;
  isPaused: boolean;
  isAutomated: boolean;
  deadline: string | null;
  nowMs: number;
}

/**
 * Presentation and request admission for a human Yahtzee action.
 * PostgreSQL remains authoritative: this only fails the client closed once
 * the server-owned deadline is no longer in the future.
 */
export function isYahtzeeManualTurnOpen({
  gamePhase,
  isMyTurn,
  isPaused,
  isAutomated,
  deadline,
  nowMs,
}: YahtzeeManualTurnAdmission): boolean {
  if (gamePhase !== 'playing' || !isMyTurn || isPaused || isAutomated || !deadline) {
    return false;
  }

  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(deadlineMs) && deadlineMs > nowMs;
}
