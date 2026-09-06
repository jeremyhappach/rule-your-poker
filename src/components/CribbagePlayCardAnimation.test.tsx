// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
vi.mock('./CribbagePlayingCard', () => ({ CribbagePlayingCard: () => <span data-testid="played-card" /> }));
import { CribbagePlayCardAnimation, type CribbagePlayCardIntent } from './CribbagePlayCardAnimation';

const intent: CribbagePlayCardIntent = {
  id: 'hand-1-play-1', mode: 'self', card: { rank: '5', suit: 'spades', value: 5 },
  sourceRect: { x: 0, y: 100, width: 40, height: 60 },
  destRect: { x: 0, y: 0, width: 40, height: 60 },
};
describe('pegging card transport continuity', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('keeps the landed card through a slow receipt, then releases to the authoritative row once', () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const view = render(<CribbagePlayCardAnimation intent={intent} destinationReady={false} onSettled={settled} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(view.queryByTestId('played-card')).not.toBeNull();
    expect(settled).not.toHaveBeenCalled();
    view.rerender(<CribbagePlayCardAnimation intent={intent} destinationReady onSettled={settled} />);
    expect(view.queryByTestId('played-card')).toBeNull();
    expect(settled).toHaveBeenCalledExactlyOnceWith(intent.id);
  });
  it('does not retire a newer hand from an old landing timer', () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const view = render(<CribbagePlayCardAnimation intent={intent} destinationReady={false} onSettled={settled} />);
    act(() => vi.advanceTimersByTime(500));
    const next = { ...intent, id: 'hand-2-play-1' };
    view.rerender(<CribbagePlayCardAnimation intent={next} destinationReady onSettled={settled} />);
    act(() => vi.advanceTimersByTime(200));
    expect(settled).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(settled).toHaveBeenCalledExactlyOnceWith(next.id);
  });
  it('cancels a rejected pending play without leaving a visible overlay', () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const view = render(<CribbagePlayCardAnimation intent={intent} destinationReady={false} onSettled={settled} />);
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(<CribbagePlayCardAnimation intent={null} destinationReady={false} onSettled={settled} />);
    expect(view.queryByTestId('played-card')).toBeNull();
    expect(settled).not.toHaveBeenCalled();
  });
});
