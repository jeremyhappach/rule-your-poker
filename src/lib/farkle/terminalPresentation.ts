import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import type { FarkleScope, FarkleState } from './types';

export function farkleTerminalToken(scope: FarkleScope, winnerId: string): string {
  return ['farkle', 'winseq', scope.gameId, scope.dealerGameId, scope.handNumber, winnerId, scope.roundId].join('|');
}

/** Matches a committed ledger batch; does not calculate or dispatch any transfer. */
export function isFarkleTerminalPayout(batch: ChipPresentationBatch, scope: FarkleScope, state: FarkleState): boolean {
  if (state._authorityScope !== scope.roundId || state.gamePhase !== 'complete' || !state.winnerPlayerId
    || batch.game_id !== scope.gameId || batch.dealer_game_id !== scope.dealerGameId || batch.reason !== 'transfer') return false;
  const losers = state.turnOrder.filter(id => id !== state.winnerPlayerId);
  if (!losers.length || batch.transfers.length !== losers.length) return false;
  const payers = new Set<string>();
  for (const transfer of batch.transfers) {
    if (transfer.from.kind !== 'player' || transfer.to.kind !== 'player'
      || transfer.to.playerId !== state.winnerPlayerId || !losers.includes(transfer.from.playerId ?? '')
      || transfer.amount !== state.config.ante_amount) return false;
    payers.add(transfer.from.playerId!);
  }
  return payers.size === losers.length;
}
