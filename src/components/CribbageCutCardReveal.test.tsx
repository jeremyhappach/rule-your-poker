// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('./CribbagePlayingCard', () => ({
  CribbagePlayingCard: () => <div data-testid="cut-face" />,
}));

vi.mock('./canonicalShell/CanonicalCardBack', () => ({
  CanonicalCardBack: () => <div data-testid="cut-back" />,
}));

vi.mock('@/lib/debugEventLogger', () => ({
  logDebugEvent: vi.fn(),
}));

import { CribbageCutCardReveal } from './CribbageCutCardReveal';

const cutCard = { rank: '5', suit: 'spades' as const, value: 5 };

describe('CribbageCutCardReveal completion boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cannot consume an unresolved cut as a completed reveal', () => {
    vi.useFakeTimers();
    const complete = vi.fn();
    const { rerender } = render(<CribbageCutCardReveal card={{ rank: '?', suit: '?', value: 0 } as any} cardBackColors={{ color: '#123', darkColor: '#012' }} handBoundaryKey="masked-cut" onRevealComplete={complete} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(complete).not.toHaveBeenCalled();
    rerender(<CribbageCutCardReveal card={cutCard} cardBackColors={{ color: '#123', darkColor: '#012' }} handBoundaryKey="masked-cut" onRevealComplete={complete} />);
    act(() => vi.advanceTimersByTime(600));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('acknowledges the hand after the visible cut flip completes', () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();

    render(
      <CribbageCutCardReveal
        card={cutCard}
        cardBackColors={{ color: '#123', darkColor: '#012' }}
        handBoundaryKey="hand-a"
        onRevealComplete={onRevealComplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(onRevealComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    expect(onRevealComplete).toHaveBeenLastCalledWith('hand-a');
  });

  it('acknowledges the new boundary when identity changes during the flip', () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();
    const { rerender } = render(
      <CribbageCutCardReveal
        card={cutCard}
        cardBackColors={{ color: '#123', darkColor: '#012' }}
        handBoundaryKey="presentation-a"
        onRevealComplete={onRevealComplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });
    rerender(
      <CribbageCutCardReveal
        card={cutCard}
        cardBackColors={{ color: '#123', darkColor: '#012' }}
        handBoundaryKey="presentation-b"
        onRevealComplete={onRevealComplete}
      />,
    );

    expect(onRevealComplete).toHaveBeenCalledTimes(1);
    expect(onRevealComplete).toHaveBeenLastCalledWith('presentation-b');

    act(() => {
      vi.runAllTimers();
    });
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });
});
