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
  presentationTransferCursor: number | null;
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

export interface HolmChuckyLossDecisionPlayer {
  id: string;
  current_decision?: string | null;
  sitting_out?: boolean;
  status?: string | null;
}

export interface HolmChuckyLossContext {
  playerIds: string[];
  amount: number;
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
 * Stable identity for one database-owned Chucky-loss settlement. Unlike the
 * former Date.now trigger, this value cannot churn when the awaiting effect
 * re-enters during an otherwise unchanged render.
 */
export function buildHolmChuckyLossSettlementKey(
  identity: HolmShowdownPresentationIdentity,
): string {
  return buildHolmShowdownPresentationKey(identity);
}

export function isHolmChuckyLossResult(result: string | null | undefined): boolean {
  if (!result) return false;
  return (
    /^(?:Ya tie but ya lose! )?Chucky beat .+ with .+\. -\$\d+$/.test(result)
    || /^(?:Tie broken by Chucky!|Ya tie but ya lose!) .+ lose to Chucky's .+\. \$\d+ added to pot\.?$/.test(result)
  );
}

/**
 * Derive financial participant UUIDs from authoritative hand decisions, never
 * from a mutable display name embedded in result copy. The result text only
 * supplies the already-published amount; the immutable transfer batch remains
 * the financial authority.
 */
export function deriveHolmChuckyLossContext(
  result: string | null | undefined,
  players: readonly HolmChuckyLossDecisionPlayer[],
): HolmChuckyLossContext | null {
  if (!result) return null;
  const stayedPlayers = players.filter((player) => (
    player.current_decision === 'stay'
    && !player.sitting_out
    && player.status !== 'observer'
    && player.status !== 'left'
  ));

  const single = result.match(/^(?:Ya tie but ya lose! )?Chucky beat .+ with .+\. -\$(\d+)$/);
  if (single) {
    const amount = Number(single[1]);
    if (stayedPlayers.length !== 1 || !Number.isInteger(amount) || amount <= 0) return null;
    return { playerIds: [stayedPlayers[0].id], amount };
  }

  const tied = result.match(
    /^(?:Tie broken by Chucky!|Ya tie but ya lose!) .+ lose to Chucky's .+\. \$(\d+) added to pot\.?$/,
  );
  if (!tied) return null;
  const totalAmount = Number(tied[1]);
  if (
    stayedPlayers.length < 2
    || !Number.isInteger(totalAmount)
    || totalAmount <= 0
    || totalAmount % stayedPlayers.length !== 0
  ) return null;
  return {
    playerIds: stayedPlayers.map((player) => player.id),
    amount: totalAmount / stayedPlayers.length,
  };
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

  // A hidden authoritative successor can commit while this client is still
  // presenting its predecessor. Never let that later batch borrow the
  // predecessor's otherwise-identical result context or presentation gate.
  if (
    stage !== null
    && state.presentationTransferCursor !== null
    && batch.cursor > state.presentationTransferCursor
  ) {
    return false;
  }

  if (stage === 'showdown-pot-award') {
    return (
      state.communityFullyRevealed
      && state.chuckyVisualRevealComplete
      && state.showdownPhase === 'pot-to-winner'
    );
  }
  if (stage === 'showdown-replacement-pot') {
    return batch.cursor === state.presentationTransferCursor
      && state.showdownPhase === 'losers-to-pot';
  }
  if (stage === 'chucky-loss') {
    return batch.cursor === state.presentationTransferCursor
      && state.chuckyLossTransportPresentationReady;
  }
  if (stage === 'pussy-tax') {
    return batch.cursor === state.presentationTransferCursor
      && state.pussyTaxPresentationReady;
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
