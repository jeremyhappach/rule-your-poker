import type { ChipPresentationBatch, ChipPresentationTransfer } from './ChipPresentationLedger';

export type HolmTransferPresentationStage =
  | 'showdown-pot-award'
  | 'showdown-replacement-pot'
  | 'chucky-loss'
  | 'pussy-tax'
  | null;

export interface HolmTransferPresentationContext {
  showdownWinnerIds: readonly string[];
  showdownLoserIds: readonly string[];
  showdownMatchAmount: number;
  chuckyLossPlayerIds: readonly string[];
  chuckyLossAmount: number;
  pussyTaxPlayerIds: readonly string[];
  pussyTaxAmount: number;
}

export interface HolmTransferPresentationAdmissionState extends HolmTransferPresentationContext {
  communityFullyRevealed: boolean;
  chuckyVisualRevealComplete: boolean;
  chuckyLossTransportPresentationReady: boolean;
  winPotPresentationReady: boolean;
  showdownPhase: 'idle' | 'pot-to-winner' | 'losers-to-pot';
  pussyTaxPresentationReady: boolean;
}

export interface HolmShowdownPresentationIdentity {
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  transferCursor: number | null;
}

export interface HolmChuckyLossPresentationIdentity {
  handContextId: string | null;
  triggerId: string | null;
}

/**
 * A Holm dealer game contains many hands whose game-level `current_round`
 * remains 1. Use the authoritative rounds-row identity for the phase-plan
 * latch so identical consecutive showdowns are distinct, while the immutable
 * transfer cursor keeps re-delivery of that exact settlement deduped.
 */
export function buildHolmShowdownPresentationKey({
  dealerGameId,
  roundId,
  handNumber,
  transferCursor,
}: HolmShowdownPresentationIdentity): string {
  return [
    dealerGameId ?? 'no-dealer-game',
    roundId ?? `hand-${handNumber ?? 'unknown'}`,
    `cursor-${transferCursor ?? 'unknown'}`,
  ].join('|');
}

/**
 * The Chucky-loss transport belongs to one settled hand and must not borrow an
 * announcement acknowledgement from another hand or replay of the same table.
 */
export function buildHolmChuckyLossPresentationKey({
  handContextId,
  triggerId,
}: HolmChuckyLossPresentationIdentity): string | null {
  if (!triggerId) return null;
  return [handContextId ?? 'no-hand', triggerId].join('|');
}

/**
 * A committed Chucky-loss transfer may start only after the exact result
 * announcement has rendered. Card reveal completion alone is insufficient:
 * the community row and result rail have their own presentation boundary.
 */
export function canPresentHolmChuckyLossTransport({
  chuckyVisualRevealComplete,
  lossPresentationKey,
  announcementPaintedKey,
}: {
  chuckyVisualRevealComplete: boolean;
  lossPresentationKey: string | null;
  announcementPaintedKey: string | null;
}): boolean {
  return (
    chuckyVisualRevealComplete &&
    lossPresentationKey !== null &&
    lossPresentationKey === announcementPaintedKey
  );
}

function samePlayerSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && actual.every((playerId) => expected.includes(playerId));
}

function allTransfersMatchAmount(
  transfers: readonly ChipPresentationTransfer[],
  amount: number,
): boolean {
  return amount > 0 && transfers.length > 0 && transfers.every((transfer) => transfer.amount === amount);
}

/**
 * Holm controls *when* a committed transfer may start, never its balances or
 * flight. This classifier makes that gate exact: an ante or unrelated transfer
 * cannot be held behind a terminal stage merely because it is player-to-pot.
 */
export function classifyHolmTransferPresentationStage(
  batch: ChipPresentationBatch,
  context: HolmTransferPresentationContext,
): HolmTransferPresentationStage {
  const transfers = batch.transfers;
  if (transfers.length === 0) return null;

  const potAwards = transfers.filter(
    (transfer) => transfer.from.kind === 'pot' && transfer.to.kind === 'player',
  );
  if (
    batch.reason === 'win'
    && potAwards.length === transfers.length
    && samePlayerSet(
      potAwards.map((transfer) => transfer.to.playerId ?? ''),
      context.showdownWinnerIds,
    )
  ) {
    return 'showdown-pot-award';
  }

  const potContributions = transfers.filter(
    (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'pot',
  );
  if (potContributions.length !== transfers.length || batch.reason !== 'transfer') {
    return null;
  }

  const contributors = potContributions.map((transfer) => transfer.from.playerId ?? '');
  if (
    samePlayerSet(contributors, context.showdownLoserIds)
    && allTransfersMatchAmount(potContributions, context.showdownMatchAmount)
  ) {
    return 'showdown-replacement-pot';
  }

  if (
    samePlayerSet(contributors, context.chuckyLossPlayerIds)
    && allTransfersMatchAmount(potContributions, context.chuckyLossAmount)
  ) {
    return 'chucky-loss';
  }

  if (
    samePlayerSet(contributors, context.pussyTaxPlayerIds)
    && allTransfersMatchAmount(potContributions, context.pussyTaxAmount)
  ) {
    return 'pussy-tax';
  }

  return null;
}

/**
 * A Holm `transfer` batch whose entire topology is player-to-pot is a
 * hand-resolution consequence (showdown replacement pot, Chucky loss, or
 * pussy tax). Realtime may deliver the immutable batch before the matching
 * result/context update. That ordering must fail closed: an unclassified
 * terminal contribution may wait for context, but it may never animate as an
 * ordinary ante.
 */
export function isUnclassifiedHolmPlayerToPotTransfer(
  batch: ChipPresentationBatch,
  stage: HolmTransferPresentationStage,
): boolean {
  return (
    stage === null
    && batch.reason === 'transfer'
    && batch.transfers.length > 0
    && batch.transfers.every(
      (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'pot',
    )
  );
}

/**
 * Complete Holm admission policy for immutable chip batches. This is kept
 * pure so the batch-first/result-second realtime ordering can be proved in a
 * unit test instead of depending on React effect timing.
 */
export function canAdmitHolmTransferPresentation(
  batch: ChipPresentationBatch,
  state: HolmTransferPresentationAdmissionState,
): boolean {
  const stage = classifyHolmTransferPresentationStage(batch, state);

  if (stage === 'showdown-pot-award') {
    return (
      state.communityFullyRevealed
      && state.chuckyVisualRevealComplete
      && state.showdownPhase === 'pot-to-winner'
    );
  }
  if (stage === 'showdown-replacement-pot') {
    return state.showdownPhase === 'losers-to-pot';
  }
  if (stage === 'chucky-loss') {
    return state.chuckyLossTransportPresentationReady;
  }
  if (stage === 'pussy-tax') {
    return state.pussyTaxPresentationReady;
  }
  if (isUnclassifiedHolmPlayerToPotTransfer(batch, stage)) {
    return false;
  }

  const movesPotToPlayer = batch.transfers.some(
    (transfer) => transfer.from.kind === 'pot' && transfer.to.kind === 'player',
  );
  if (movesPotToPlayer) {
    return (
      state.communityFullyRevealed
      && state.chuckyVisualRevealComplete
      && state.winPotPresentationReady
    );
  }

  // Immutable antes and non-terminal transfers do not borrow a showdown gate.
  return true;
}
