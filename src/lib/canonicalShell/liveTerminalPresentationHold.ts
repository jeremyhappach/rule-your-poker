export interface LiveTerminalPresentationScope {
  gameId: string;
  gameType: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
}

export interface LiveTerminalPresentationObservation {
  gameId: string | null;
  gameType: string | null;
  status: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  terminalResultPresent: boolean;
}

function scopeFromLiveObservation(
  observation: LiveTerminalPresentationObservation,
): LiveTerminalPresentationScope | null {
  if (observation.status !== 'in_progress') return null;
  if (!observation.gameId || !observation.gameType) return null;
  if (!observation.dealerGameId || !observation.roundId) return null;
  if (!Number.isInteger(observation.handNumber)) return null;

  return {
    gameId: observation.gameId,
    gameType: observation.gameType,
    dealerGameId: observation.dealerGameId,
    roundId: observation.roundId,
    handNumber: observation.handNumber as number,
  };
}

function matchesObservedScope(
  scope: LiveTerminalPresentationScope,
  observation: LiveTerminalPresentationObservation,
): boolean {
  if (scope.gameId !== observation.gameId) return false;
  if (scope.gameType !== observation.gameType) return false;
  if (scope.dealerGameId !== observation.dealerGameId) return false;
  if (observation.roundId && scope.roundId !== observation.roundId) return false;
  if (
    Number.isInteger(observation.handNumber) &&
    scope.handNumber !== observation.handNumber
  ) {
    return false;
  }
  return true;
}

/**
 * Remembers authoritative identity only while this mount observes live play.
 * A fresh mount on an already-ended session has no prior scope and therefore
 * cannot replay or hold a historical terminal presentation.
 */
export function advanceLiveTerminalPresentationScope(
  previous: LiveTerminalPresentationScope | null,
  observation: LiveTerminalPresentationObservation,
): LiveTerminalPresentationScope | null {
  const liveScope = scopeFromLiveObservation(observation);
  if (liveScope) return liveScope;

  // Realtime can briefly deliver the game row before the matching round row.
  // Retain only an already-proven live scope whose available identity still
  // matches; never manufacture a scope from an incomplete observation.
  if (
    observation.status === 'in_progress' &&
    previous &&
    matchesObservedScope(previous, observation)
  ) {
    return previous;
  }

  if (
    observation.status === 'session_ended' &&
    observation.terminalResultPresent &&
    previous &&
    matchesObservedScope(previous, observation)
  ) {
    return previous;
  }

  return null;
}

/**
 * Holds the existing table only for the exact terminal scope this mount saw
 * live. Presentation completion is a separate canonical boundary owned by
 * the route; callers release this predicate after admitting Session Ended.
 */
export function shouldHoldLiveTerminalPresentation(
  scope: LiveTerminalPresentationScope | null,
  observation: LiveTerminalPresentationObservation,
): boolean {
  return Boolean(
    scope &&
      observation.status === 'session_ended' &&
      observation.terminalResultPresent &&
      matchesObservedScope(scope, observation),
  );
}
