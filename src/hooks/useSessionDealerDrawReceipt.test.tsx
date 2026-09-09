// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DealerSelectionState } from './useHighCardDealerSelection';
import { useSessionDealerDrawReceipt } from './useSessionDealerDrawReceipt';
import { mergeAuthoritativeGameState } from '@/lib/authoritativeGameState';

const sessionId = '320e2269-3c87-40a0-9a6e-b98b2617ffb5';
const otherId = '98fbc9d5-547b-4754-8818-82f24f1b8279';
const draw: DealerSelectionState = {
  cards: [{ playerId: '8ab161cb-176e-43fa-8283-d9b55a25ee8b', position: 1,
    card: { rank: 'K', suit: '♥' }, isRevealed: true, isWinner: true,
    isDimmed: false, roundNumber: 1 }],
  announcement: 'Dealer selected', isComplete: true, winnerPosition: 1,
  preparedAt: '2026-09-08T23:58:36.694226+00:00',
};
const waiting = { id: sessionId, status: 'waiting', authority_revision: 1, dealer_selection_state: null as DealerSelectionState | null };
const selection = { ...waiting, status: 'dealer_selection', authority_revision: 3, dealer_selection_state: draw };
const setup = { ...selection, status: 'game_selection', authority_revision: 4 };
afterEach(cleanup);

describe('accepted-session dealer draw admission', () => {
  it('blocks setup on its first render, before any setup mount effects', () => {
    const mount = vi.fn();
    const Setup = () => { useLayoutEffect(mount, []); return <div>Setup</div>; };
    const Shell = ({ game }: { game: typeof waiting }) => {
      const { receipt } = useSessionDealerDrawReceipt(sessionId, game);
      return game.status === 'game_selection' && !receipt ? <Setup /> : <div>Draw or waiting</div>;
    };
    const view = render(<Shell game={waiting} />);
    view.rerender(<Shell game={setup} />);
    expect(mount).not.toHaveBeenCalled();
    expect(view.queryByText('Setup')).toBeNull();
  });

  it.each(['snapshot-first', 'realtime-first'])('drains exactly once with %s ordering', order => {
    const { result, rerender } = renderHook(({ game }) => useSessionDealerDrawReceipt(sessionId, game),
      { initialProps: { game: waiting } });
    if (order === 'realtime-first') rerender({ game: selection });
    rerender({ game: setup });
    const key = result.current.receipt!.key;
    expect(result.current.receipt?.state).toBe(draw);
    for (const row of [selection, { ...setup }, selection]) {
      rerender({ game: mergeAuthoritativeGameState(setup, row)! });
      expect(result.current.receipt?.key).toBe(key);
    }
    act(() => result.current.completeReceipt('wrong-key'));
    expect(result.current.receipt?.key).toBe(key);
    act(() => result.current.completeReceipt(key));
    expect(result.current.receipt).toBeNull();
    rerender({ game: mergeAuthoritativeGameState(setup, { ...setup })! });
    expect(result.current.receipt).toBeNull();
  });

  it('does not replay on a cold setup mount or late equal-revision delivery', () => {
    const { result, rerender } = renderHook(({ game }) => useSessionDealerDrawReceipt(sessionId, game),
      { initialProps: { game: setup } });
    expect(result.current.receipt).toBeNull();
    rerender({ game: mergeAuthoritativeGameState(setup, selection)! });
    rerender({ game: { ...setup } });
    expect(result.current.receipt).toBeNull();
  });

  it('preserves completion acknowledged during the intermediate phase', () => {
    const { result, rerender } = renderHook(({ game }) => useSessionDealerDrawReceipt(sessionId, game),
      { initialProps: { game: waiting } });
    rerender({ game: setup });
    const key = result.current.receipt!.key;
    cleanup();
    const live = renderHook(({ game }) => useSessionDealerDrawReceipt(sessionId, game),
      { initialProps: { game: selection } });
    act(() => live.result.current.completeReceipt(key));
    live.rerender({ game: setup });
    expect(live.result.current.receipt).toBeNull();
  });

  it('resets on session change, ignores old rows and old completion callbacks', () => {
    const { result, rerender } = renderHook(({ id, game }) => useSessionDealerDrawReceipt(id, game),
      { initialProps: { id: sessionId, game: waiting } });
    rerender({ id: sessionId, game: setup });
    const oldComplete = result.current.completeReceipt;
    const oldKey = result.current.receipt!.key;
    rerender({ id: otherId, game: setup });
    expect(result.current.receipt).toBeNull();
    rerender({ id: otherId, game: { ...waiting, id: otherId } });
    rerender({ id: otherId, game: { ...setup, id: otherId } });
    act(() => oldComplete(oldKey));
    expect(result.current.receipt).not.toBeNull();
    act(() => result.current.completeReceipt(oldKey));
    expect(result.current.receipt).toBeNull();
  });
});
