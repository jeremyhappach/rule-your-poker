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
