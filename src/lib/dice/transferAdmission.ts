/** Cosmetic ordering of already-committed money, scoped to the exact round. */
export function diceTransferReady(
  trigger: string | null | undefined,
  dealerGameId: string | null | undefined,
  roundId: string | null | undefined,
  batchDealerGameId: string | null | undefined,
  terminalObserved: boolean,
  noQualifyPending: boolean,
  batchRoundId?: string | null,
) {
  // Missing identity is a legacy catch-up, never permission to borrow a receipt.
  // A different round can be a tie rollover or an out-of-order arrival. In both
  // cases reconcile committed values without claiming a current presentation.
  if (!batchRoundId || batchRoundId !== roundId || batchDealerGameId !== dealerGameId) return 'reconcile' as const;
  if (!trigger || !dealerGameId || !roundId || batchDealerGameId !== dealerGameId) return false;
  const [game, phase, , dealer, , round] = trigger.split('|');
  return ['horses', 'ship-captain-crew'].includes(game) && phase === 'winseq' &&
    dealer === dealerGameId && round === roundId && terminalObserved && !noQualifyPending;
}
