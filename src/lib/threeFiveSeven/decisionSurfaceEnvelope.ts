export function isThreeFiveSevenDecisionSurfaceEnvelopeOpen(args: {
  canDecide: boolean;
  activeTab: string | null | undefined;
  isWaitingPhase: boolean;
  sessionEndedPhase: boolean;
  isDealerConfigPhase: boolean;
  hasCurrentPlayer: boolean;
  autoFold: boolean;
}): boolean {
  return args.canDecide
    && args.activeTab === 'cards'
    && !args.isWaitingPhase
    && !args.sessionEndedPhase
    && !args.isDealerConfigPhase
    && args.hasCurrentPlayer
    && !args.autoFold;
}
