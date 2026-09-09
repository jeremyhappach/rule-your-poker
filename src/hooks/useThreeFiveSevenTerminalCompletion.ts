import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  getTerminal357CompletionReceipt,
  type Terminal357CompletionReceipt,
} from '@/lib/threeFiveSeven/terminalCompletion';
import type { Terminal357Descriptor } from '@/lib/threeFiveSeven/terminalDescriptor';

export interface Terminal357CompletionFrame {
  enabled: boolean;
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  status: string | null;
  revealBlocked: boolean;
  descriptor: Terminal357Descriptor | null;
}

/** Presentation permission only. PostgreSQL still owns settlement and handoff.
 * An inactive animation is NOT a completion receipt: it is also inactive
 * throughout the decision reveal. Old callbacks read the latest committed
 * identity, so neither an await nor the pot tail can authorize a later game.
 */
export function useThreeFiveSevenTerminalCompletion(frame: Terminal357CompletionFrame) {
  const current = useRef<Terminal357CompletionFrame | null>(null);
  const completedGeneration = useRef<string | null>(null);
  useLayoutEffect(() => {
    current.current = frame;
    return () => { current.current = null; };
  }, [frame]);

  const matchesCurrent = useCallback((receipt?: Terminal357CompletionReceipt | null) => {
    const live = current.current;
    const descriptor = getTerminal357CompletionReceipt(live?.descriptor);
    return !!receipt && !!live?.enabled && !live.revealBlocked && !!descriptor
      && (live.status === 'game_over' || live.status === 'session_ended')
      && receipt.gameId === live.gameId && receipt.gameId === descriptor.gameId
      && receipt.dealerGameId === live.dealerGameId
      && receipt.dealerGameId === descriptor.dealerGameId
      // Terminal settlement can clear current_round. The immutable terminal
      // descriptor still names the exact round; a populated live round must match.
      && (live.roundId === null || receipt.roundId === live.roundId)
      && receipt.roundId === descriptor.roundId
      && receipt.handNumber === live.handNumber && receipt.handNumber === descriptor.handNumber
      && receipt.terminalGenerationId === descriptor.terminalGenerationId;
  }, []);

  const acceptCompletion = useCallback((receipt: Terminal357CompletionReceipt) => {
    if (!matchesCurrent(receipt) || completedGeneration.current === receipt.terminalGenerationId) {
      return false;
    }
    completedGeneration.current = receipt.terminalGenerationId;
    return true;
  }, [matchesCurrent]);

  const canAdvance = useCallback((receipt?: Terminal357CompletionReceipt) => (
    matchesCurrent(receipt) && completedGeneration.current === receipt?.terminalGenerationId
  ), [matchesCurrent]);

  return { acceptCompletion, canAdvance };
}
