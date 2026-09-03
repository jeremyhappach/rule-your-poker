export function isThreeFiveSevenDecisionSurfaceEnvelopeOpen(args: {
  canDecide: boolean;
  gameStatus: string | null | undefined;
  hasAuthoritativeTimer: boolean;
  activeTab: string | null | undefined;
  isWaitingPhase: boolean;
  sessionEndedPhase: boolean;
  isDealerConfigPhase: boolean;
  hasCurrentPlayer: boolean;
  autoFold: boolean;
}): boolean {
  return args.canDecide
    // The canonical Session Ended table phase is admitted only after the
    // terminal presentation completes.  Decision controls must retire as
    // soon as the authoritative session becomes terminal, rather than
    // waiting for that later presentation handoff.
    && args.gameStatus !== 'game_over'
    && args.gameStatus !== 'session_ended'
    && args.hasAuthoritativeTimer
    && args.activeTab === 'cards'
    && !args.isWaitingPhase
    && !args.sessionEndedPhase
    && !args.isDealerConfigPhase
    && args.hasCurrentPlayer
    && !args.autoFold;
}

/**
 * A 3-5-7 decision is actionable only against the complete private hand from
 * its current authoritative round.  In particular, a cached 3-card Round 1
 * hand must never make the Round 2 or Round 3 decision rail actionable while
 * that round's 5- or 7-card row is still arriving.
 */
export function isThreeFiveSevenCurrentRoundHandReady(args: {
  roundNumber: number | null | undefined;
  rawCardCount: number;
  presentedCardCount: number;
}): boolean {
  const expectedCardCount = args.roundNumber === 1
    ? 3
    : args.roundNumber === 2
      ? 5
      : args.roundNumber === 3
        ? 7
        : null;

  return expectedCardCount !== null
    && args.rawCardCount === expectedCardCount
    && args.presentedCardCount === expectedCardCount;
}
