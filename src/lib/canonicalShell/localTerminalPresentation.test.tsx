// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeLocalTerminal, useLocalTerminalPresentation, type LocalTerminalObservation, type LocalTerminalState } from './localTerminalPresentation';
import { isYahtzeeTerminalPayout, yahtzeeTerminalToken } from '../yahtzeeTerminalPresentation';
import type { ChipPresentationBatch } from './ChipPresentationLedger';

const scope = { gameId: 'session', gameType: 'yahtzee', dealerGameId: 'dealer-game', roundId: 'round', handNumber: 1 };
const payout = { ...scope, winnerId: 'winner', loserIds: ['loser'] };
const token = yahtzeeTerminalToken(payout);
const live: LocalTerminalObservation<string> = { sessionId: 'session', scope, live: true, terminal: false, snapshot: 'playing' };
const terminal = { ...live, live: false, terminal: true, snapshot: 'final scorecard and roster' };
const empty: LocalTerminalState<string> = { sessionId: 'session', observed: null, pending: null };
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });

describe('local terminal presentation', () => {
  it('does not replay a cold terminal entry or an unrelated round', () => {
    expect(observeLocalTerminal(empty, terminal).pending).toBeNull();
    const observed = observeLocalTerminal(empty, live);
    for (const changed of [{ roundId: 'other' }, { handNumber: 2 }, { dealerGameId: 'other' }, { gameId: 'other' }]) {
      expect(observeLocalTerminal(observed, { ...terminal, scope: { ...scope, ...changed } }).pending).toBeNull();
    }
  });

  it('retains the exact snapshot across setup and successor authority, then resets on leaving the session', () => {
    const held = observeLocalTerminal(observeLocalTerminal(empty, live), terminal);
    expect(held.pending?.snapshot).toBe(terminal.snapshot);
    expect(observeLocalTerminal(held, { ...live, scope: null, live: false, snapshot: null })).toBe(held);
    expect(observeLocalTerminal(held, { ...live, scope: { ...scope, dealerGameId: 'successor' } })).toBe(held);
    expect(observeLocalTerminal(held, { ...live, sessionId: 'another-session' }).pending).toBeNull();
  });

  it('lets the faster browser release while the slower browser keeps its own table; rejects late callbacks and replay', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const clients: Record<string, ReturnType<typeof useLocalTerminalPresentation<string>>> = {};
    function Client({ id, input }: { id: string; input: LocalTerminalObservation<string> }) {
      clients[id] = useLocalTerminalPresentation(input);
      return <output data-client={id}>{clients[id].pending?.snapshot ?? 'current authority'}</output>;
    }
    const render = (input: LocalTerminalObservation<string>) => act(() => root.render(<><Client id="fast" input={input} /><Client id="slow" input={input} /></>));
    try {
      render(live);
      render(terminal);
      act(() => { expect(clients.fast.complete(token)).toEqual(scope); });
      expect(clients.fast.pending).toBeNull();
      expect(clients.slow.pending?.snapshot).toBe(terminal.snapshot);
      render({ ...live, scope: null, live: false, snapshot: 'setup' });
      act(() => { expect(clients.slow.complete(token.replace('|round', '|old-round'))).toBeNull(); });
      expect(clients.slow.pending?.snapshot).toBe(terminal.snapshot);
      act(() => { expect(clients.slow.complete(token)).toEqual(scope); });
      act(() => { expect(clients.slow.complete(token)).toBeNull(); });
      render(terminal);
      expect(clients.fast.pending).toBeNull();
      expect(clients.slow.pending).toBeNull();
      render({ ...live, scope: { ...scope, dealerGameId: 'next', roundId: 'next' } });
      render({ ...terminal, scope: { ...scope, dealerGameId: 'next', roundId: 'next' } });
      act(() => { expect(clients.slow.complete(token)).toBeNull(); });
      expect(clients.slow.pending?.scope.roundId).toBe('next');
    } finally { act(() => root.unmount()); }
  });
});

describe('Yahtzee canonical payout admission', () => {
  const batch: ChipPresentationBatch = { id: 'batch', game_id: scope.gameId, dealer_game_id: scope.dealerGameId,
    cursor: 1, reason: 'transfer', transfers: [{ id: 'flight', amount: 10,
      from: { kind: 'player', playerId: 'loser' }, to: { kind: 'player', playerId: 'winner' } }],
    opening_balances: {}, closing_balances: {} };
  it('admits only the authoritative dealer-game payout with every expected payer', () => {
    expect(isYahtzeeTerminalPayout(batch, payout)).toBe(true);
    expect(isYahtzeeTerminalPayout(batch, null)).toBe(false);
    for (const changed of [{ game_id: 'other' }, { dealer_game_id: null }, { dealer_game_id: 'prior' }, { transfers: [] }]) {
      expect(isYahtzeeTerminalPayout({ ...batch, ...changed }, payout)).toBe(false);
    }
    expect(isYahtzeeTerminalPayout(batch, { ...payout, winnerId: 'other' })).toBe(false);
    expect(isYahtzeeTerminalPayout(batch, { ...payout, loserIds: ['other'] })).toBe(false);
    expect(isYahtzeeTerminalPayout({ ...batch, transfers: [batch.transfers[0], batch.transfers[0]] },
      { ...payout, loserIds: ['loser', 'second'] })).toBe(false);
  });
});
