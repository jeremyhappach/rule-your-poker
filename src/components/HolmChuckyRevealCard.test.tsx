// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Card } from '@/lib/cardUtils';

vi.mock('./PlayingCard', () => ({
  PlayingCard: ({ card }: { card?: { rank?: string } }) => (
    <div data-testid={`face-${card?.rank ?? 'unknown'}`} />
  ),
}));

vi.mock('./canonicalShell/CanonicalCardBack', () => ({
  CanonicalCardBack: () => <div data-testid="card-back" />,
}));

import {
  HOLM_CHUCKY_FLIP_MS,
  HolmChuckyRevealCard,
} from './HolmChuckyRevealCard';

const card: Card = { rank: 'Q', suit: '♥' };

function renderedFlipState(): string | null | undefined {
  return screen
    .getByTestId('card-back')
    .closest('[data-holm-chucky-flip-card]')
    ?.getAttribute('data-holm-chucky-flip-state');
}

describe('HolmChuckyRevealCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('animates a live reveal and reports completion only after the flip finishes', () => {
    const onRevealComplete = vi.fn();
    const { rerender } = render(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-1#chucky-0#Q♥"
        revealed={false}
        onRevealComplete={onRevealComplete}
      />,
    );

    expect(screen.getByTestId('card-back')).not.toBeNull();
    expect(screen.getByTestId('face-Q')).not.toBeNull();
    expect(renderedFlipState()).toBe('hidden');

    rerender(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-1#chucky-0#Q♥"
        revealed
        onRevealComplete={onRevealComplete}
      />,
    );

    expect(renderedFlipState()).toBe('flipping');
    expect(onRevealComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(HOLM_CHUCKY_FLIP_MS - 1);
    });
    expect(onRevealComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderedFlipState()).toBe('revealed');
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('reconciles an already-revealed rejoin without replaying the flip', () => {
    const onRevealComplete = vi.fn();

    render(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-rejoin#chucky-3#Q♥"
        revealed
        onRevealComplete={onRevealComplete}
      />,
    );

    expect(renderedFlipState()).toBe('revealed');
    expect(onRevealComplete).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runAllTimers();
    });
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('resets only when the exact hand/card presentation identity changes', () => {
    const onRevealComplete = vi.fn();
    const { rerender } = render(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-1#chucky-0#Q♥"
        revealed
        onRevealComplete={onRevealComplete}
      />,
    );

    rerender(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-2#chucky-0#Q♥"
        revealed={false}
        onRevealComplete={onRevealComplete}
      />,
    );
    expect(renderedFlipState()).toBe('hidden');

    rerender(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-2#chucky-0#Q♥"
        revealed
        onRevealComplete={onRevealComplete}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(HOLM_CHUCKY_FLIP_MS);
    });

    expect(onRevealComplete).toHaveBeenCalledTimes(2);
  });

  it('completes immediately when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const onRevealComplete = vi.fn();
    const { rerender } = render(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-1#chucky-0#Q♥"
        revealed={false}
        onRevealComplete={onRevealComplete}
      />,
    );

    rerender(
      <HolmChuckyRevealCard
        card={card}
        presentationKey="hand-1#chucky-0#Q♥"
        revealed
        onRevealComplete={onRevealComplete}
      />,
    );

    expect(renderedFlipState()).toBe('revealed');
    expect(onRevealComplete).toHaveBeenCalledTimes(1);
  });
});
