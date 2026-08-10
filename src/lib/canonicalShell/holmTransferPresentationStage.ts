import type { ChipPresentationBatch, ChipPresentationTransfer } from './ChipPresentationLedger';

export type HolmTransferPresentationStage =
  | 'showdown-pot-award'
  | 'showdown-replacement-pot'
  | 'chucky-loss'
  | null;

export interface HolmTransferPresentationContext {
  showdownWinnerIds: readonly string[];
  showdownLoserIds: readonly string[];
  showdownMatchAmount: number;
  chuckyLossPlayerIds: readonly string[];
  chuckyLossAmount: number;
}

export interface HolmShowdownPresentationIdentity {
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  transferCursor: number | null;
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

  return null;
}
