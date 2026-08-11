export type CribbageEntryMode = 'live-transition' | 'historical-entry';

export interface CribbageCutPresentationArgs {
  entryMode: CribbageEntryMode;
  phase: string | null | undefined;
  hasCutCard: boolean;
  authoritativeCribCount: number;
  locallySettledCribCount: number;
  cutRevealCompletedHandKey: string | null;
  handKey: string;
}

export interface CribbageCutPresentationState {
  /** A rejoin sees an already-authoritative cut, not a local animation. */
  isHistoricalExposedCut: boolean;
  /** The local renderer may safely display these already-parked crib cards. */
  settledCribCount: number;
  /** The cut is either visibly completed or authoritatively exposed on rejoin. */
  cutRevealComplete: boolean;
  /** Gates turn spotlight and pegging controls during a real live cut reveal only. */
  isPeggingPresentationBlocked: boolean;
}

/**
 * Resolves the complete local presentation boundary for a Cribbage cut.
 *
 * A historical entry intentionally has no prior discard/cut animation owner.
 * Once the database exposes the cut in pegging, both local presentation facts
 * are therefore reconstructed from the authoritative state: the cut is face
 * up and every persisted crib card is already settled. Keeping these facts in
 * one derivation prevents a partial rejoin recovery from stranding legal play.
 */
export function deriveCribbageCutPresentation(
  args: CribbageCutPresentationArgs,
): CribbageCutPresentationState {
  const authoritativeCribCount = Math.max(0, args.authoritativeCribCount);
  const locallySettledCribCount = Math.max(0, args.locallySettledCribCount);
  const isHistoricalExposedCut =
    args.entryMode === 'historical-entry' &&
    args.phase === 'pegging' &&
    args.hasCutCard &&
    authoritativeCribCount > 0;
  const settledCribCount = isHistoricalExposedCut
    ? Math.max(locallySettledCribCount, authoritativeCribCount)
    : locallySettledCribCount;
  const cutRevealComplete =
    isHistoricalExposedCut || args.cutRevealCompletedHandKey === args.handKey;
  const isPeggingPresentationBlocked = Boolean(
    args.phase === 'pegging' &&
      args.hasCutCard &&
      (settledCribCount < authoritativeCribCount || !cutRevealComplete),
  );

  return {
    isHistoricalExposedCut,
    settledCribCount,
    cutRevealComplete,
    isPeggingPresentationBlocked,
  };
}
