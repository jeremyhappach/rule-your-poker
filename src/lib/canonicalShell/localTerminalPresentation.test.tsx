// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localTerminalTokenMatches, observeLocalTerminal, useLocalTerminalPresentation, type LocalTerminalObservation, type LocalTerminalState } from './localTerminalPresentation';
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
  it.each(['horses', 'ship-captain-crew'])('retains live %s across peer advancement and accepts only its six-part completion', gameType => {
    const diceScope = { ...scope, gameType };
    const playing = { ...live, scope: diceScope };
    const complete = { ...terminal, scope: diceScope };
    expect(observeLocalTerminal(empty, complete).pending).toBeNull();
    const held = observeLocalTerminal(observeLocalTerminal(empty, playing), complete);
    expect(observeLocalTerminal(held, { ...playing, scope: null, live: false, snapshot: null }).pending?.scope).toEqual(diceScope);
    expect(observeLocalTerminal(held, { ...playing, scope: { ...diceScope, dealerGameId: 'next', roundId: 'next-round' } }).pending?.scope).toEqual(diceScope);
    const exact = [gameType, 'winseq', scope.gameId, scope.dealerGameId, scope.handNumber, scope.roundId].join('|');
    expect(localTerminalTokenMatches(diceScope, exact)).toBe(true);
    for (const stale of [exact + '|extra', exact.replace('|round', '|old'), exact.replace('|dealer-game|', '|other|'), exact.replace('|session|', '|other|'), exact.replace('|1|', '|2|')]) expect(localTerminalTokenMatches(diceScope, stale)).toBe(false);
    expect(observeLocalTerminal(held, { ...playing, sessionId: 'other' }).pending).toBeNull();
  });
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

  it.each(['yahtzee', 'horses', 'ship-captain-crew'])('lets faster %s browser release while slower browser retains its exact table', gameType => {
    const testScope = { ...scope, gameType };
    const testToken = gameType === 'yahtzee' ? token : [gameType, 'winseq', scope.gameId, scope.dealerGameId, scope.handNumber, scope.roundId].join('|');
    const playing = { ...live, scope: testScope };
    const completed = { ...terminal, scope: testScope };
    const container = document.createElement('div');
    const root = createRoot(container);
    const clients: Record<string, ReturnType<typeof useLocalTerminalPresentation<string>>> = {};
    function Client({ id, input }: { id: string; input: LocalTerminalObservation<string> }) {
      clients[id] = useLocalTerminalPresentation(input);
      return <output data-client={id}>{clients[id].pending?.snapshot ?? 'current authority'}</output>;
    }
    const render = (input: LocalTerminalObservation<string>) => act(() => root.render(<><Client id="fast" input={input} /><Client id="slow" input={input} /></>));
    try {
      render(playing);
      render(completed);
      act(() => { expect(clients.fast.complete(testToken)).toEqual(testScope); });
      expect(clients.fast.pending).toBeNull();
      expect(clients.slow.pending?.snapshot).toBe(completed.snapshot);
      render({ ...playing, scope: null, live: false, snapshot: 'setup' });
      act(() => { expect(clients.slow.complete(testToken.replace('|round', '|old-round'))).toBeNull(); });
      expect(clients.slow.pending?.snapshot).toBe(completed.snapshot);
      act(() => { expect(clients.slow.complete(testToken)).toEqual(testScope); });
      act(() => { expect(clients.slow.complete(testToken)).toBeNull(); });
      render(completed);
      expect(clients.fast.pending).toBeNull();
      expect(clients.slow.pending).toBeNull();
      render({ ...playing, scope: { ...scope, dealerGameId: 'next', roundId: 'next' } });
      render({ ...completed, scope: { ...scope, dealerGameId: 'next', roundId: 'next' } });
      act(() => { expect(clients.slow.complete(testToken)).toBeNull(); });
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
