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

export interface CribbageCutPresentationEntryModeArgs {
  /** Route-mount provenance. It remains authoritative for an initial rejoin. */
  entryMode: CribbageEntryMode;
  /** Canonical hand identity for the presentation boundary. */
  handKey: string;
  /** Latest authoritative/rendered phase being resolved. */
  phase: string | null | undefined;
  /** Hand whose pre-pegging lifecycle this mounted client actually observed. */
  observedPrePeggingHandKey: string | null;
  /** Persisted crib cards known for the current authoritative snapshot. */
  authoritativeCribCount: number;
  /** Cards whose local discard transport has reached its terminal visual state. */
  locallySettledCribCount: number;
  /** True only while this client still owns a discard-to-crib transport. */
  hasDiscardIntent: boolean;
}

/**
 * A route can be live while a later hand is not: a delayed peer may receive
 * that hand's first usable state directly in pegging, after another client
 * already completed discard and cut. Seeing an early hand frame alone is not
 * enough to prove that the client still owns the cut: a reconnect can lose
 * the last discard transport, leaving no local callback capable of releasing
 * the gate. Only an active transport or a fully settled local crib keeps the
 * normal live cut presentation. Otherwise the exposed cut is historical.
 */
export function resolveCribbageCutPresentationEntryMode(
  args: CribbageCutPresentationEntryModeArgs,
): CribbageEntryMode {
  if (args.entryMode === 'historical-entry') return 'historical-entry';
  if (args.phase !== 'pegging') return 'live-transition';
  if (args.observedPrePeggingHandKey !== args.handKey) return 'historical-entry';
  if (args.hasDiscardIntent) return 'live-transition';
  if (args.locallySettledCribCount >= args.authoritativeCribCount) {
    return 'live-transition';
  }
  return 'historical-entry';
}

export interface CribbageHistoricalCribHydrationArgs {
  entryMode: CribbageEntryMode;
  authoritativeCribCount: number;
  locallySettledCribCount: number;
  hasDiscardIntent: boolean;
}

/**
 * A refreshed client has no local transport completion for cards that were
 * already committed before it mounted. Recover that one initial presentation
 * fact from the persisted crib count, but never absorb later live growth: once
 * any card is locally settled, the normal discard transport remains the owner.
 */
export function deriveCribbageHistoricalCribHydrationSeed(
  args: CribbageHistoricalCribHydrationArgs,
): number | null {
  const authoritativeCribCount = Math.max(0, args.authoritativeCribCount);
  const locallySettledCribCount = Math.max(0, args.locallySettledCribCount);
  if (
    args.entryMode !== 'historical-entry' ||
    args.hasDiscardIntent ||
    authoritativeCribCount === 0 ||
    locallySettledCribCount !== 0
  ) {
    return null;
  }
  return authoritativeCribCount;
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
