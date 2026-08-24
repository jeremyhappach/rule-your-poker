export type ThreeFiveSevenRouteEntryMode = 'live-transition' | 'historical-entry';

export interface ThreeFiveSevenRouteEntryIdentity {
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
}

export interface ThreeFiveSevenRouteEntryResolution {
  baseline: ThreeFiveSevenRouteEntryIdentity | null;
  entryMode: ThreeFiveSevenRouteEntryMode | undefined;
}

function isCompleteThreeFiveSevenIdentity(
  identity: ThreeFiveSevenRouteEntryIdentity,
): identity is ThreeFiveSevenRouteEntryIdentity & {
  dealerGameId: string;
  roundId: string;
  handNumber: number;
} {
  return identity.dealerGameId !== null
    && identity.roundId !== null
    && identity.handNumber !== null;
}

/**
 * Preserve the first complete authoritative wave seen by this route mount.
 * Partial hydration must not become provenance: doing so labels a refresh as
 * a live deal and leaves DealRuntime waiting for intents that will never be
 * emitted for already-persisted cards.
 */
export function resolveThreeFiveSevenRouteEntryMode(
  baseline: ThreeFiveSevenRouteEntryIdentity | null,
  current: ThreeFiveSevenRouteEntryIdentity,
  initialEntryMode: ThreeFiveSevenRouteEntryMode = 'historical-entry',
): ThreeFiveSevenRouteEntryResolution {
  if (!isCompleteThreeFiveSevenIdentity(current)) {
    return { baseline, entryMode: undefined };
  }

  const resolvedBaseline = baseline ?? current;
  const isHistorical =
    resolvedBaseline.dealerGameId === current.dealerGameId
    && resolvedBaseline.roundId === current.roundId
    && resolvedBaseline.handNumber === current.handNumber;

  return {
    baseline: resolvedBaseline,
    // The first complete 3-5-7 identity is historical only on a true route
    // entry. A persistent table route can first see 3-5-7 after another
    // dealer game; that exact baseline must remain a live transition for the
    // lifetime of the wave instead of flipping to historical on rerender.
    entryMode: isHistorical ? initialEntryMode : 'live-transition',
  };
}

const THREE_FIVE_SEVEN_GAME_TYPES = new Set(['3-5-7', '3-5-7-game', '357']);

/** Classify the first 3-5-7 identity on a persistent table route. */
export function classifyInitialThreeFiveSevenEntry(
  previousHydratedGameType: string | null,
  currentGameType: string,
): ThreeFiveSevenRouteEntryMode | undefined {
  if (!THREE_FIVE_SEVEN_GAME_TYPES.has(currentGameType)) return undefined;
  return previousHydratedGameType !== null
    && !THREE_FIVE_SEVEN_GAME_TYPES.has(previousHydratedGameType)
    ? 'live-transition'
    : 'historical-entry';
}
