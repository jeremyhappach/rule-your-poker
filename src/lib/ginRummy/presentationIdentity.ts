/**
 * Gin Rummy presentation identity — single immutable 3-axis tuple.
 *
 * Plan A (narrow): every Gin render, DealRuntime mount, orchestrator
 * mount, and opening-deal dispatch may use ONLY one of these objects
 * (or `null`). The three fields never come from independent sources.
 *
 * Provenance contract (correction 1): every authoritative state admitted
 * for Gin must be tagged with a full GinPresentationIdentity. Snapshots
 * lacking any axis are NOT rendered as current. Provenance is attached
 * at the admission boundary from the fetched/realtime round context.
 *
 * Mount contract (correction 2): while committedIdentity is null,
 * NOTHING gameplay-shaped may mount — no DealRuntime, no orchestrator,
 * no opening-deal dispatch, no felt/overlay render of any older state.
 */
export type GinPresentationIdentity = {
  dealerGameId: string;
  roundId: string;
  handNumber: number;
};

type GinPresentationActionState = {
  actionCount?: number;
  lastAction?: {
    type: string;
    playerId: string;
    timestamp: string;
  } | null;
};

/**
 * One committed Gin action keeps the same presentation identity across the
 * caller's optimistic projection, RPC result, refetch, and Realtime echo.
 * Timestamps are deliberately excluded because the browser and PostgreSQL
 * stamp their projections independently.
 */
export const ginPresentationActionKey = (
  state: GinPresentationActionState | null | undefined,
  handContextId: string | null | undefined,
): string | null => {
  const action = state?.lastAction;
  const actionCount = state?.actionCount;
  if (!handContextId || !action || !Number.isInteger(actionCount) || (actionCount ?? 0) < 1) {
    return null;
  }
  return `${handContextId}#a${actionCount}#${action.type}#p${action.playerId}`;
};

export const isGinMaskedCard = (
  card: { rank?: string; suit?: string; masked?: boolean } | null | undefined,
): boolean => !!card && (card.masked === true || card.rank === '?' || card.suit === '?');

/**
 * Keep an in-flight self draw out of the active hand until its canonical
 * transport settles. This projection runs independently of opening-deal
 * admission so both a masked stock placeholder and a known discard card stay
 * withheld when the authoritative hand has already grown past ten cards.
 */
export const withholdGinDrawnCards = <T extends { rank: string; suit: string }>(
  hand: T[],
  withheld: readonly { rank: string; suit: string }[] | null | undefined,
): T[] => {
  if (!withheld || withheld.length === 0) return hand;

  const clipped = [...hand];
  for (const card of withheld) {
    const index = clipped.findIndex(
      candidate => candidate.rank === card.rank && candidate.suit === card.suit,
    );
    if (index !== -1) clipped.splice(index, 1);
  }

  return clipped.length === hand.length ? hand : clipped;
};

export const ginIdentityKey = (id: GinPresentationIdentity | null | undefined): string =>
  id ? `${id.dealerGameId}#r${id.roundId}#h${id.handNumber}` : '';

export const ginIdentityEqual = (
  a: GinPresentationIdentity | null | undefined,
  b: GinPresentationIdentity | null | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.dealerGameId === b.dealerGameId &&
    a.roundId === b.roundId &&
    a.handNumber === b.handNumber
  );
};

/**
 * `next` is a forward advancement vs `prev` when:
 *  - prev is null, OR
 *  - dealerGameId changed (sequence root replacement; verbatim), OR
 *  - same dealerGameId with strictly greater handNumber, OR
 *  - same dealerGameId + same handNumber but a different roundId
 *    (degenerate case where handNumber lags a fresh round row).
 */
export const isGinIdentityForward = (
  prev: GinPresentationIdentity | null,
  next: GinPresentationIdentity | null,
): boolean => {
  if (!next) return false;
  if (!prev) return true;
  if (prev.dealerGameId !== next.dealerGameId) return true;
  if (next.handNumber > prev.handNumber) return true;
  if (next.handNumber < prev.handNumber) return false;
  return !!next.roundId && prev.roundId !== next.roundId;
};

/**
 * Returns the exact mismatch axis between a payload's provenance and
 * the committed identity, or null if they match. Used at every
 * admission boundary so the trace explicitly logs which axis failed.
 */
export type GinIdentityMismatchAxis =
  | 'no-committed-identity'
  | 'dealerGameId'
  | 'roundId'
  | 'handNumber'
  | null;

export const ginIdentityMismatchAxis = (
  payload: GinPresentationIdentity | null,
  committed: GinPresentationIdentity | null,
): GinIdentityMismatchAxis => {
  if (!committed) return 'no-committed-identity';
  if (!payload) return 'no-committed-identity';
  if (payload.dealerGameId !== committed.dealerGameId) return 'dealerGameId';
  if (payload.roundId !== committed.roundId) return 'roundId';
  if (payload.handNumber !== committed.handNumber) return 'handNumber';
  return null;
};
