import type { Terminal357Descriptor } from './terminalDescriptor';

export interface Terminal357CompletionReceipt {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  terminalGenerationId: string;
}

/** Capture the identity of the presentation that actually reached pot arrival. */
export function getTerminal357CompletionReceipt(identity: {
  [K in keyof Terminal357CompletionReceipt]: Terminal357CompletionReceipt[K] | null;
} | null | undefined): Terminal357CompletionReceipt | null {
  if (!identity?.gameId || !identity.dealerGameId || !identity.roundId
      || !identity.terminalGenerationId || !Number.isInteger(identity.handNumber)
      || identity.handNumber! < 1) return null;
  return {
    gameId: identity.gameId,
    dealerGameId: identity.dealerGameId,
    roundId: identity.roundId,
    handNumber: identity.handNumber!,
    terminalGenerationId: identity.terminalGenerationId,
  };
}

/** Older sweep callers have no hand/generation fields. They must wait for
 * the matching immutable descriptor, never invent them or borrow a new game.
 */
export function getTerminal357SweepCompletionReceipt(
  presentation: {
    gameId: string | null;
    dealerGameId: string | null;
    roundId: string | null;
    handContextId: string | null;
    terminalResultIdentity: string | null;
  },
  descriptor: Terminal357Descriptor | null,
): Terminal357CompletionReceipt | null {
  const receipt = getTerminal357CompletionReceipt(descriptor);
  if (!receipt || !descriptor
      || presentation.gameId !== receipt.gameId
      || presentation.dealerGameId !== receipt.dealerGameId
      || (presentation.roundId !== null && presentation.roundId !== receipt.roundId)
      || presentation.handContextId !== descriptor.handContextId
      || presentation.terminalResultIdentity !== descriptor.terminalResultIdentity) return null;
  return receipt;
}
