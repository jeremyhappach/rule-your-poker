/**
 * Pure identity helpers — no React, no Supabase imports.
 * Split from `authoritativeIdentity.ts` so unit tests don't pull the
 * supabase client (which references `localStorage` and explodes under
 * node-env vitest).
 */

export interface AuthoritativeIdentity {
  dealerGameId: string | null;
  handNumber: number | null;
  roundId: string | null;
}

export function identityKey(identity: AuthoritativeIdentity | null): string {
  if (!identity) return '';
  return `${identity.dealerGameId ?? ''}:${identity.handNumber ?? ''}:${identity.roundId ?? ''}`;
}

export function authoritativeIdentityEquals(
  a: AuthoritativeIdentity | null,
  b: AuthoritativeIdentity | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.dealerGameId === b.dealerGameId &&
    a.handNumber === b.handNumber &&
    a.roundId === b.roundId
  );
}

/**
 * `next` is a forward identity advancement vs `prev` when:
 *  - `prev` is null (first observed identity), OR
 *  - dealerGameId changed, OR
 *  - same dealerGameId with strictly greater handNumber, OR
 *  - same dealerGameId + same handNumber but a different roundId (degenerate
 *    case where handNumber lags behind a freshly inserted round row).
 */
export function isIdentityForward(
  prev: AuthoritativeIdentity | null,
  next: AuthoritativeIdentity | null,
): boolean {
  if (!next) return false;
  if (!prev) return true;
  if (prev.dealerGameId !== next.dealerGameId) return true;
  const ph = prev.handNumber ?? -1;
  const nh = next.handNumber ?? -1;
  if (nh > ph) return true;
  if (nh < ph) return false;
  return !!next.roundId && prev.roundId !== next.roundId;
}
