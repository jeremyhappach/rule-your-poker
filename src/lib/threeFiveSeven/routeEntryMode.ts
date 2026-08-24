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

const THREE_FIVE_SEVEN_PRE_HAND_ROUTE_STATUSES = new Set([
  'waiting',
  'waiting_for_players',
  'dealer_selection',
  'game_selection',
  'configuring',
  'ante_decision',
]);

/**
 * A route that rendered one of these phases before its first complete 3-5-7
 * identity witnessed a live dealer-game startup. A cold mount whose first
 * authoritative frame is already `in_progress` did not.
 */
export function isThreeFiveSevenPreHandRouteStatus(
  status: string | null | undefined,
): boolean {
  return !!status && THREE_FIVE_SEVEN_PRE_HAND_ROUTE_STATUSES.has(status);
}

/** Classify the first 3-5-7 identity on a persistent table route. */
export function classifyInitialThreeFiveSevenEntry(
  previousHydratedGameType: string | null,
  currentGameType: string,
  observedPreHandLifecycle = false,
): ThreeFiveSevenRouteEntryMode | undefined {
  if (!THREE_FIVE_SEVEN_GAME_TYPES.has(currentGameType)) return undefined;
  return observedPreHandLifecycle
    || (previousHydratedGameType !== null
      && !THREE_FIVE_SEVEN_GAME_TYPES.has(previousHydratedGameType))
    ? 'live-transition'
    : 'historical-entry';
}
