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

export type HolmAdmittedTransferStage =
  | 'showdown-pot-award'
  | 'showdown-replacement-pot'
  | 'chucky-loss'
  | 'pussy-tax';

export interface HolmAdmittedTransferPresentation {
  stage: HolmAdmittedTransferStage;
  completion: HolmContinuationPresentationCompletion | null;
}

export type HolmPresentationBarrier = HolmPresentationIdentity;

export function getHolmPresentationHandKey(
  identity: Pick<HolmPresentationIdentity, 'dealerGameId' | 'roundId' | 'handNumber'>,
): string {
  return `${identity.dealerGameId}|${identity.roundId}|h${identity.handNumber}`;
}

export function getHolmPresentationIdentityKey(
  identity: HolmPresentationIdentity,
): string {
  return `${getHolmPresentationHandKey(identity)}|cursor:${identity.transferCursor}`;
}

export function isSameHolmPresentationHand(
  left: Pick<HolmPresentationIdentity, 'dealerGameId' | 'roundId' | 'handNumber'> | null | undefined,
  right: Pick<HolmPresentationIdentity, 'dealerGameId' | 'roundId' | 'handNumber'> | null | undefined,
): boolean {
  return !!left && !!right
    && left.dealerGameId === right.dealerGameId
    && left.roundId === right.roundId
    && left.handNumber === right.handNumber;
}

export function isSameHolmPresentationIdentity(
  left: HolmPresentationIdentity | null | undefined,
  right: HolmPresentationIdentity | null | undefined,
): boolean {
  return isSameHolmPresentationHand(left, right)
    && !!left
    && !!right
    && left.transferCursor === right.transferCursor;
}

/** Capture immutable completion identity when the ledger admits a stage. */
export function captureHolmAdmittedTransferPresentation(
  identity: HolmPresentationIdentity | null | undefined,
  batchCursor: number,
  stage: HolmAdmittedTransferStage,
): HolmAdmittedTransferPresentation {
  const continuationStage: HolmContinuationPresentationStage | null =
    stage === 'showdown-pot-award' ? null : stage;
  const completion = continuationStage
    && identity
    && batchCursor === identity.transferCursor
      ? { ...identity, stage: continuationStage }
      : null;
  return { stage, completion };
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

/**
 * Reconcile a predecessor hold from durable, exact-hand completion evidence.
 * Evidence may arrive before or after the barrier is latched; either ordering
 * produces the same release and duplicate evidence is harmless.
 */
export function reconcileHolmPresentationBarrierFromEvidence(
  barrier: HolmPresentationBarrier | null,
  evidence: ReadonlyMap<string, HolmContinuationPresentationCompletion>,
): {
  barrier: HolmPresentationBarrier | null;
  completion: HolmContinuationPresentationCompletion | null;
  released: boolean;
} {
  if (!barrier) {
    return { barrier: null, completion: null, released: false };
  }
  const completion = evidence.get(getHolmPresentationIdentityKey(barrier)) ?? null;
  if (!completion) {
    return { barrier, completion: null, released: false };
  }
  const release = releaseHolmPresentationBarrier(barrier, completion);
  return { ...release, completion: release.released ? completion : null };
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
