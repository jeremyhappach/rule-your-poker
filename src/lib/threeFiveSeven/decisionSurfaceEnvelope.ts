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
