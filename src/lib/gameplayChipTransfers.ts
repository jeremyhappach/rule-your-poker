import { supabase } from '@/integrations/supabase/client';

export type GameplayTransferEndpoint =
  | { kind: 'pot' }
  | { kind: 'player'; playerId: string };

export interface GameplayChipTransfer {
  from: GameplayTransferEndpoint;
  to: GameplayTransferEndpoint;
  amount: number;
}

export type GameplayTransferReason =
  | 'ante'
  | 'bet'
  | 'win'
  | 'leg'
  | 'sweep'
  | 'transfer';

/**
 * The only browser-side writer for a visible pot/player chip movement.
 *
 * It deliberately contains no opening balance, optimistic balance, or batch
 * id: PostgreSQL locks and reads the endpoints, applies the financial change,
 * and commits the immutable presentation batch in that same transaction.
 */
export async function settleGameplayChipTransfers(
  gameId: string,
  transfers: GameplayChipTransfer[],
  reason: GameplayTransferReason,
): Promise<void> {
  if (!gameId || transfers.length === 0) return;

  const { error } = await supabase.rpc('settle_gameplay_chip_transfers', {
    p_game_id: gameId,
    p_transfers: transfers.map((transfer) => ({
      from: transfer.from.kind === 'pot'
        ? { kind: 'pot' }
        : { kind: 'player', playerId: transfer.from.playerId },
      to: transfer.to.kind === 'pot'
        ? { kind: 'pot' }
        : { kind: 'player', playerId: transfer.to.playerId },
      amount: transfer.amount,
    })),
    p_reason: reason,
  });

  if (error) throw error;
}

export function playerToPot(playerId: string, amount: number): GameplayChipTransfer {
  return { from: { kind: 'player', playerId }, to: { kind: 'pot' }, amount };
}

export function potToPlayer(playerId: string, amount: number): GameplayChipTransfer {
  return { from: { kind: 'pot' }, to: { kind: 'player', playerId }, amount };
}

export function playerToPlayer(
  fromPlayerId: string,
  toPlayerId: string,
  amount: number,
): GameplayChipTransfer {
  return {
    from: { kind: 'player', playerId: fromPlayerId },
    to: { kind: 'player', playerId: toPlayerId },
    amount,
  };
}
