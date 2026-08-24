import type { ChipPresentationCursorState } from './canonicalShell/ChipPresentationLedger';

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

export type HolmRouteEntryMode = 'live-transition' | 'historical-entry';

export interface HolmRouteEntryIdentity {
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
}

const HOLM_PRE_HAND_ROUTE_STATUSES = new Set([
  'waiting',
  'waiting_for_players',
  'dealer_selection',
  'game_selection',
  'configuring',
  'ante_decision',
]);

/**
 * A client that rendered one of these phases before the first Holm hand
 * existed witnessed a live dealer-game startup. A cold mount whose first
 * authoritative frame is already `in_progress` did not.
 */
export function isHolmPreHandRouteStatus(status: string | null | undefined): boolean {
  return !!status && HOLM_PRE_HAND_ROUTE_STATUSES.has(status);
}

/**
 * Classify only presentation provenance. The database still owns the hand;
 * this decides whether this mounted route should run its deal transports or
 * admit an already-present hand without replaying them.
 */
export function classifyHolmRouteEntryMode({
  baseline,
  current,
  roundStatus,
  observedPreHandLifecycle,
}: {
  baseline: HolmRouteEntryIdentity | null;
  current: HolmRouteEntryIdentity;
  roundStatus: string | null | undefined;
  observedPreHandLifecycle: boolean;
}): HolmRouteEntryMode {
  if (roundStatus === 'dealing' || observedPreHandLifecycle) {
    return 'live-transition';
  }
  if (!baseline) return 'live-transition';
  return baseline.dealerGameId === current.dealerGameId
    && baseline.roundId === current.roundId
    && baseline.handNumber === current.handNumber
      ? 'historical-entry'
      : 'live-transition';
}

export interface HolmContinuationPresentationCompletion extends HolmPresentationIdentity {
  stage: HolmContinuationPresentationStage;
}

export type HolmAdmittedTransferStage =
  | 'showdown-pot-award'
  | 'chucky-final-award'
  | 'showdown-replacement-pot'
  | 'chucky-loss'
  | 'pussy-tax';

export interface HolmAdmittedTransferPresentation {
  stage: HolmAdmittedTransferStage;
  completion: HolmContinuationPresentationCompletion | null;
}

export type HolmPresentationBarrier = HolmPresentationIdentity;

export type HolmShowdownPresentationPhase =
  | 'idle'
  | 'pot-to-winner'
  | 'losers-to-pot';

export type HolmShowdownDurablePresentationAction =
  | 'advance-to-replacement-pot'
  | 'complete-replacement-pot';

/**
 * Multiplayer showdown settlement emits one pot-award batch followed
 * immediately by the final replacement-pot batch whose cursor is published
 * on the Holm presentation identity.
 */
export function getHolmShowdownPresentationCursors(
  identity: HolmPresentationIdentity | null | undefined,
): { potAwardCursor: number; replacementPotCursor: number } | null {
  if (!identity || !Number.isInteger(identity.transferCursor) || identity.transferCursor < 2) {
    return null;
  }
  return {
    potAwardCursor: identity.transferCursor - 1,
    replacementPotCursor: identity.transferCursor,
  };
}

function isHolmPresentationCursorComplete(state: ChipPresentationCursorState): boolean {
  return state === 'settled' || state === 'reconciled';
}

/**
 * The connected Holm terminal handoff needs two independent receipts: the
 * visible celebration clock and the exact immutable Chucky-award cursor. The
 * returned key is level-triggered and identity-scoped so either arrival order
 * is safe and duplicate renders remain harmless.
 */
export function getHolmChuckyWinPresentationCompletionKey({
  identity,
  activeTriggerId,
  completedTriggerId,
  cursorState,
}: {
  identity: HolmPresentationIdentity | null | undefined;
  activeTriggerId: string | null | undefined;
  completedTriggerId: string | null | undefined;
  cursorState: ChipPresentationCursorState;
}): string | null {
  if (
    !identity
    || !activeTriggerId
    || completedTriggerId !== activeTriggerId
    || !isHolmPresentationCursorComplete(cursorState)
  ) {
    return null;
  }
  return `${getHolmPresentationIdentityKey(identity)}|chucky-win:${activeTriggerId}`;
}

/**
 * Convert durable, exact-cursor ledger receipts into level-triggered Holm
 * stage drains. This is deliberately independent of the transient batch
 * settlement callback so a dropped React edge cannot strand the phase.
 */
export function getHolmShowdownDurablePresentationAction({
  phase,
  potAwardCursorState,
  replacementPotCursorState,
}: {
  phase: HolmShowdownPresentationPhase;
  potAwardCursorState: ChipPresentationCursorState;
  replacementPotCursorState: ChipPresentationCursorState;
}): HolmShowdownDurablePresentationAction | null {
  if (
    phase === 'pot-to-winner'
    && isHolmPresentationCursorComplete(potAwardCursorState)
  ) {
    return 'advance-to-replacement-pot';
  }
  if (
    phase === 'losers-to-pot'
    && isHolmPresentationCursorComplete(replacementPotCursorState)
  ) {
    return 'complete-replacement-pot';
  }
  return null;
}

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
    stage === 'showdown-pot-award' || stage === 'chucky-final-award' ? null : stage;
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
  rabbitPostRevealDwellComplete,
  pussyTaxSettled,
}: {
  result: string | null | undefined;
  resultPainted: boolean;
  rabbitHuntRequired: boolean;
  rabbitRevealComplete: boolean;
  rabbitPostRevealDwellComplete: boolean;
  pussyTaxSettled: boolean;
}): boolean {
  if (result !== 'Pussy Tax!' && result !== 'Everyone folded! No penalty.') return false;
  if (!resultPainted) return false;
  if (rabbitHuntRequired && !rabbitRevealComplete) return false;
  if (rabbitHuntRequired && !rabbitPostRevealDwellComplete) return false;
  return result !== 'Pussy Tax!' || pussyTaxSettled;
}
