import type { ChipPresentationBatch, ChipPresentationCursorState } from '@/lib/canonicalShell/ChipPresentationLedger';
import type { Terminal357Descriptor } from './terminalDescriptor';

export interface Terminal357SweepCreditBatchRow {
  game_id: string;
  dealer_game_id: string | null;
  cursor: number;
  reason: string;
  transfers: unknown;
}

export interface Terminal357SweepCreditCheckpoint {
  gameId: string;
  dealerGameId: string;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  terminalResultIdentity: string;
  terminalGenerationId: string;
  winnerId: string;
  transferCursor: number;
}

export type Terminal357NormalSweepSignal = 'credit-settled' | 'overlay-complete';

export interface Terminal357NormalSweepGate {
  terminalGenerationId: string;
  creditSettled: boolean;
  overlayComplete: boolean;
}

export function createTerminal357NormalSweepGate(
  terminalGenerationId: string,
): Terminal357NormalSweepGate {
  return {
    terminalGenerationId,
    creditSettled: false,
    overlayComplete: false,
  };
}

export function advanceTerminal357NormalSweepGate(
  gate: Terminal357NormalSweepGate,
  terminalGenerationId: string,
  signal: Terminal357NormalSweepSignal,
): Terminal357NormalSweepGate {
  if (gate.terminalGenerationId !== terminalGenerationId) return gate;
  if (signal === 'credit-settled' && gate.creditSettled) return gate;
  if (signal === 'overlay-complete' && gate.overlayComplete) return gate;
  return {
    ...gate,
    creditSettled: gate.creditSettled || signal === 'credit-settled',
    overlayComplete: gate.overlayComplete || signal === 'overlay-complete',
  };
}

export function isTerminal357NormalSweepGateReady(
  gate: Terminal357NormalSweepGate | null | undefined,
): boolean {
  return gate?.creditSettled === true && gate.overlayComplete === true;
}

/**
 * Resolve the one immutable reserve-return batch belonging to a normal 3-5-7
 * terminal. A dealer game can settle only once, so more than one matching
 * zero-flight sweep row is an authority ambiguity and must not be guessed.
 */
export function selectTerminal357SweepCreditCheckpoint(
  descriptor: Terminal357Descriptor | null | undefined,
  rows: readonly Terminal357SweepCreditBatchRow[] | null | undefined,
): Terminal357SweepCreditCheckpoint | null {
  if (
    descriptor?.source !== 'normal-win'
    || !descriptor.gameId
    || !descriptor.dealerGameId
    || !descriptor.terminalGenerationId
    || !descriptor.terminalResultIdentity
    || !descriptor.winnerId
  ) {
    return null;
  }

  const matching = (rows ?? []).filter((row) => (
    row.game_id === descriptor.gameId
    && row.dealer_game_id === descriptor.dealerGameId
    && row.reason === 'sweep'
    && Number.isInteger(row.cursor)
    && row.cursor > 0
    && Array.isArray(row.transfers)
    && row.transfers.length === 0
  ));
  if (matching.length !== 1) return null;

  return {
    gameId: descriptor.gameId,
    dealerGameId: descriptor.dealerGameId,
    roundId: descriptor.roundId,
    handNumber: descriptor.handNumber,
    handContextId: descriptor.handContextId,
    terminalResultIdentity: descriptor.terminalResultIdentity,
    terminalGenerationId: descriptor.terminalGenerationId,
    winnerId: descriptor.winnerId,
    transferCursor: matching[0].cursor,
  };
}

export function terminal357SweepCreditMatchesDescriptor(
  checkpoint: Terminal357SweepCreditCheckpoint | null | undefined,
  descriptor: Terminal357Descriptor | null | undefined,
): boolean {
  return !!checkpoint
    && descriptor?.source === 'normal-win'
    && checkpoint.gameId === descriptor.gameId
    && checkpoint.dealerGameId === descriptor.dealerGameId
    && checkpoint.roundId === descriptor.roundId
    && checkpoint.handNumber === descriptor.handNumber
    && checkpoint.handContextId === descriptor.handContextId
    && checkpoint.terminalResultIdentity === descriptor.terminalResultIdentity
    && checkpoint.terminalGenerationId === descriptor.terminalGenerationId
    && checkpoint.winnerId === descriptor.winnerId;
}

export function isTerminal357SweepCreditBatch(
  checkpoint: Terminal357SweepCreditCheckpoint | null | undefined,
  descriptor: Terminal357Descriptor | null | undefined,
  batch: Pick<ChipPresentationBatch, 'cursor' | 'reason' | 'transfers'>,
): boolean {
  return terminal357SweepCreditMatchesDescriptor(checkpoint, descriptor)
    && batch.cursor === checkpoint!.transferCursor
    && batch.reason === 'sweep'
    && batch.transfers.length === 0;
}

export function isTerminal357SweepCreditReleased(
  checkpoint: Terminal357SweepCreditCheckpoint | null | undefined,
  descriptor: Terminal357Descriptor | null | undefined,
  cursorState: ChipPresentationCursorState,
): boolean {
  return terminal357SweepCreditMatchesDescriptor(checkpoint, descriptor)
    && (cursorState === 'settled' || cursorState === 'reconciled');
}
