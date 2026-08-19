import { describe, expect, it } from 'vitest';
import type { Terminal357Descriptor } from './terminalDescriptor';
import {
  isTerminal357SweepCreditBatch,
  isTerminal357SweepCreditReleased,
  selectTerminal357SweepCreditCheckpoint,
} from './terminalSweepCredit';

const descriptor: Terminal357Descriptor = {
  gameId: 'game-1',
  dealerGameId: 'dealer-game-1',
  roundId: 'round-h2-r2',
  handNumber: 2,
  handContextId: 'round-h2-r2',
  terminalResultIdentity: '🏆 Winner won the game!',
  terminalGenerationId: 'terminal-generation-1',
  source: 'normal-win',
  winnerId: 'winner-1',
  winnerName: 'Winner',
  winnerPosition: 4,
  targetLegs: 3,
  proofCards: null,
  hadAuthoritativeLegs: true,
};

const sweepRow = {
  game_id: 'game-1',
  dealer_game_id: 'dealer-game-1',
  cursor: 8,
  reason: 'sweep',
  transfers: [],
};

describe('3-5-7 terminal sweep-credit checkpoint', () => {
  it('selects the exact immutable zero-flight sweep batch', () => {
    expect(selectTerminal357SweepCreditCheckpoint(descriptor, [sweepRow])).toEqual({
      gameId: 'game-1',
      dealerGameId: 'dealer-game-1',
      roundId: 'round-h2-r2',
      handNumber: 2,
      handContextId: 'round-h2-r2',
      terminalResultIdentity: '🏆 Winner won the game!',
      terminalGenerationId: 'terminal-generation-1',
      winnerId: 'winner-1',
      transferCursor: 8,
    });
  });

  it('rejects a nonzero-flight, mismatched, or ambiguous sweep row', () => {
    expect(selectTerminal357SweepCreditCheckpoint(descriptor, [
      { ...sweepRow, transfers: [{ amount: 2 }] },
    ])).toBeNull();
    expect(selectTerminal357SweepCreditCheckpoint(descriptor, [
      { ...sweepRow, dealer_game_id: 'dealer-game-older' },
    ])).toBeNull();
    expect(selectTerminal357SweepCreditCheckpoint(descriptor, [
      sweepRow,
      { ...sweepRow, cursor: 9 },
    ])).toBeNull();
  });

  it.each(['unknown', 'queued', 'running', 'reconciling'] as const)(
    'keeps pot presentation blocked while the exact cursor is %s',
    (cursorState) => {
      const checkpoint = selectTerminal357SweepCreditCheckpoint(descriptor, [sweepRow]);
      expect(isTerminal357SweepCreditReleased(checkpoint, descriptor, cursorState)).toBe(false);
    },
  );

  it.each(['settled', 'reconciled'] as const)(
    'releases pot presentation when the exact cursor is durably %s',
    (cursorState) => {
      const checkpoint = selectTerminal357SweepCreditCheckpoint(descriptor, [sweepRow]);
      expect(isTerminal357SweepCreditReleased(checkpoint, descriptor, cursorState)).toBe(true);
    },
  );

  it('accepts the live callback only for the exact cursor', () => {
    const checkpoint = selectTerminal357SweepCreditCheckpoint(descriptor, [sweepRow]);
    expect(isTerminal357SweepCreditBatch(checkpoint, descriptor, {
      cursor: 8,
      reason: 'sweep',
      transfers: [],
    })).toBe(true);
    expect(isTerminal357SweepCreditBatch(checkpoint, descriptor, {
      cursor: 7,
      reason: 'sweep',
      transfers: [],
    })).toBe(false);
  });

  it('does not let a late terminal checkpoint release a newer dealer game', () => {
    const checkpoint = selectTerminal357SweepCreditCheckpoint(descriptor, [sweepRow]);
    const newerDescriptor = {
      ...descriptor,
      dealerGameId: 'dealer-game-2',
      roundId: 'round-h1-r1',
      handNumber: 1,
      handContextId: 'round-h1-r1',
      terminalGenerationId: 'terminal-generation-2',
    };
    expect(isTerminal357SweepCreditReleased(
      checkpoint,
      newerDescriptor,
      'reconciled',
    )).toBe(false);
  });
});
