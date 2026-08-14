export type HolmContinuationPresentationStage =
  | 'showdown-replacement-pot'
  | 'chucky-loss'
  | 'pussy-tax'
  | 'zero-transfer';

export interface HolmPresentationIdentity {
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  transferCursor: number;
}

export interface HolmContinuationPresentationCompletion extends HolmPresentationIdentity {
  stage: HolmContinuationPresentationStage;
}

export type HolmPresentationBarrier = HolmPresentationIdentity;

export function getHolmPresentationHandKey(
  identity: Pick<HolmPresentationIdentity, 'dealerGameId' | 'roundId' | 'handNumber'>,
): string {
  return `${identity.dealerGameId}|${identity.roundId}|h${identity.handNumber}`;
}

export function isSameHolmPresentationIdentity(
  left: HolmPresentationIdentity | null | undefined,
  right: HolmPresentationIdentity | null | undefined,
): boolean {
  return !!left && !!right
    && left.dealerGameId === right.dealerGameId
    && left.roundId === right.roundId
    && left.handNumber === right.handNumber
    && left.transferCursor === right.transferCursor;
}

/**
 * A live presented hand may establish one predecessor barrier. Once present,
 * later authoritative hands cannot replace it; only the exact presented
 * hand's completion or a dealer-game reset can clear it.
 */
export function latchHolmPresentationBarrier({
  current,
  presented,
  observedLive,
  alreadyReleased,
  roundCompleted,
  hasResult,
}: {
  current: HolmPresentationBarrier | null;
  presented: HolmPresentationIdentity | null;
  observedLive: boolean;
  alreadyReleased: boolean;
  roundCompleted: boolean;
  hasResult: boolean;
}): HolmPresentationBarrier | null {
  if (current) return current;
  if (!presented || !observedLive || alreadyReleased || !roundCompleted || !hasResult) {
    return null;
  }
  return presented;
}

export function shouldHoldHolmAuthoritativeSuccessor({
  barrier,
  presentedRoundId,
  incoming,
}: {
  barrier: HolmPresentationBarrier | null;
  presentedRoundId: string | null;
  incoming: HolmPresentationIdentity;
}): boolean {
  return !!barrier
    && barrier.dealerGameId === incoming.dealerGameId
    && barrier.roundId === presentedRoundId
    && incoming.roundId !== barrier.roundId;
}

export function releaseHolmPresentationBarrier(
  barrier: HolmPresentationBarrier | null,
  completion: HolmContinuationPresentationCompletion,
): { barrier: HolmPresentationBarrier | null; released: boolean } {
  if (!isSameHolmPresentationIdentity(barrier, completion)) {
    return { barrier, released: false };
  }
  return { barrier: null, released: true };
}

export function canCompleteHolmAllFoldPresentation({
  result,
  resultPainted,
  rabbitHuntRequired,
  rabbitRevealComplete,
  pussyTaxSettled,
}: {
  result: string | null | undefined;
  resultPainted: boolean;
  rabbitHuntRequired: boolean;
  rabbitRevealComplete: boolean;
  pussyTaxSettled: boolean;
}): boolean {
  if (result !== 'Pussy Tax!' && result !== 'Everyone folded! No penalty.') return false;
  if (!resultPainted) return false;
  if (rabbitHuntRequired && !rabbitRevealComplete) return false;
  return result !== 'Pussy Tax!' || pussyTaxSettled;
}
