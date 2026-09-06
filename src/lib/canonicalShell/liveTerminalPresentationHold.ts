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
    (observation.status === 'session_ended' ||
      ((observation.gameType === 'horses' || observation.gameType === 'ship-captain-crew') && observation.status === 'game_over')) &&
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

/**
 * Keeps the gameplay seat owner mounted while an already-observed terminal
 * presentation is still running. `game_over` is included because 3-5-7
 * publishes that authoritative status before its final-leg award completes;
 * `session_ended` remains the cross-game terminal hold boundary.
 */
export function shouldHoldTerminalSeatOwnership(
  status: string | null | undefined,
  terminalPresentationActive: boolean,
  holmLastHandPresentationPending: boolean,
  liveTerminalPresentationPending: boolean,
): boolean {
  return Boolean(
    (terminalPresentationActive ||
      holmLastHandPresentationPending ||
      liveTerminalPresentationPending) &&
      (status === 'game_over' || status === 'session_ended'),
  );
}

/**
 * True when a game-owned terminal completion token belongs to the exact live
 * scope retained by the route. This makes Session Ended admission independent
 * of whether presentation completion or the terminal database snapshot arrives
 * first, without allowing an older hand's token to admit a later one.
 */
export function terminalPresentationIdentityMatchesLiveScope(
  identity: string,
  scope: LiveTerminalPresentationScope | null,
): boolean {
  if (!scope || !identity) return false;
  const [gameType, phase, gameId, dealerGameId, handNumber] = identity.split('|');
  if (phase !== 'winseq') return false;
  if (gameType !== scope.gameType) return false;
  if (gameId !== scope.gameId) return false;
  if (dealerGameId !== scope.dealerGameId) return false;
  return handNumber === String(scope.handNumber);
}
