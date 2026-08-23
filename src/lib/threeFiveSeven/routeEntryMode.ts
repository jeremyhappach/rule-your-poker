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
    entryMode: isHistorical ? 'historical-entry' : 'live-transition',
  };
}
