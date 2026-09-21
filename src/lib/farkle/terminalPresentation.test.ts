import { describe, expect, it } from 'vitest';
import { observeLocalTerminal, localTerminalTokenMatches } from '@/lib/canonicalShell/localTerminalPresentation';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import { farkleTestState } from './__fixtures__/testState';
import { farkleTerminalToken, isFarkleTerminalPayout } from './terminalPresentation';

const scope = { gameId: 'session', dealerGameId: 'dealer', roundId: 'round', handNumber: 2 };
const state = { ...farkleTestState(), _authorityScope: scope.roundId, gamePhase: 'complete' as const,
  winnerPlayerId: 'winner', turnOrder: ['winner', 'loser-a', 'loser-b'] };
const batch: ChipPresentationBatch = { id: 'batch', game_id: scope.gameId, dealer_game_id: scope.dealerGameId,
  cursor: 7, reason: 'transfer', opening_balances: {}, closing_balances: {},
  transfers: ['loser-a', 'loser-b'].map(id => ({ id, amount: state.config.ante_amount,
    from: { kind: 'player', playerId: id }, to: { kind: 'player', playerId: 'winner' } })) };

describe('Farkle canonical terminal admission', () => {
  it('accepts only the exact committed payout with every distinct payer', () => {
    expect(isFarkleTerminalPayout(batch, scope, state)).toBe(true);
    expect(isFarkleTerminalPayout({ ...batch, dealer_game_id: 'next' }, scope, state)).toBe(false);
    expect(isFarkleTerminalPayout({ ...batch, transfers: [batch.transfers[0], batch.transfers[0]] }, scope, state)).toBe(false);
    expect(isFarkleTerminalPayout({ ...batch, transfers: batch.transfers.map(t => ({ ...t, amount: t.amount + 1 })) }, scope, state)).toBe(false);
    expect(isFarkleTerminalPayout(batch, scope, { ...state, gamePhase: 'playing' })).toBe(false);
  });
  it('holds only an observed live round through server continuation and rejects stale completion', () => {
    const terminalScope = { ...scope, gameType: 'farkle' };
    const initial = { sessionId: scope.gameId, observed: null, pending: null };
    const observation = { sessionId: scope.gameId, scope: terminalScope, snapshot: state, live: true, terminal: false };
    const live = observeLocalTerminal(initial, observation);
    const held = observeLocalTerminal(live, { ...observation, live: false, terminal: true });
    expect(held.pending?.scope).toEqual(terminalScope);
    expect(observeLocalTerminal(held, { ...observation, scope: null, snapshot: null, live: false, terminal: false })).toBe(held);
    expect(localTerminalTokenMatches(terminalScope, farkleTerminalToken(scope, 'winner'))).toBe(true);
    expect(localTerminalTokenMatches(terminalScope, farkleTerminalToken({ ...scope, roundId: 'other' }, 'winner'))).toBe(false);
    expect(observeLocalTerminal(initial, { ...observation, live: false, terminal: true }).pending).toBeNull();
  });
});
