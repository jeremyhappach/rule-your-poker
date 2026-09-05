// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('./PlayingCard', () => ({
  PlayingCard: ({ card }: { card?: { rank?: string } }) => (
    <div data-testid={`face-${card?.rank ?? 'unknown'}`} />
  ),
}));

vi.mock('./canonicalShell/CanonicalCardBack', () => ({
  CanonicalCardBack: () => <div data-testid="card-back" />,
}));

vi.mock('@/lib/canonicalShell/cardTransport/DealRuntime', () => ({
  useDealRuntime: () => null,
}));

vi.mock('@/lib/canonicalShell/cardTransport/holmCommunityLandingForensics', () => ({
  armCommunityLandingSampler: vi.fn(),
  recordCommunityDomLifecycle: vi.fn(),
  recordCommunityPresentationState: vi.fn(),
}));

vi.mock('@/lib/canonicalShell/cardTransport/holmFullForensics', () => ({
  ffRecord: vi.fn(),
}));

vi.mock('@/lib/canonicalShell/useCardRowLayout', () => ({
  resolveCardRowLayout: () => ({ cardWidth: 40, cardHeight: 60, overlapPx: 0 }),
}));

vi.mock('@/lib/geometryLab/cardArtifactOverlap', () => ({
  useCardOverlap: () => 0,
}));

import { HolmCanonicalCommunityRow } from './HolmCanonicalCommunityRow';

const cards = [
  { rank: '2', suit: 'clubs' },
  { rank: '3', suit: 'diamonds' },
  { rank: 'Q', suit: 'hearts' },
  { rank: 'J', suit: 'spades' },
] as any;

describe('HolmCanonicalCommunityRow late community reveal', () => {
  let boundingBoxSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    boundingBoxSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 240,
      height: 80,
      top: 0,
      left: 0,
      right: 240,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    cleanup();
    boundingBoxSpy.mockRestore();
    vi.useRealTimers();
  });

  it('flips cards 3 and 4 when the server replaces masked slots with revealed cards', () => {
    const onFullRevealComplete = vi.fn();
    const { rerender } = render(
      <HolmCanonicalCommunityRow
        handContextId="hand-1"
        cards={[...cards.slice(0, 2), { rank: '?', suit: '?' }, { rank: '?', suit: '?' }] as any}
        revealed={2}
        onFullRevealComplete={onFullRevealComplete}
      />,
    );

    expect(screen.getAllByTestId('card-back')).toHaveLength(2);
    expect(screen.queryByTestId('face-?')).toBeNull();

    rerender(
      <HolmCanonicalCommunityRow
        handContextId="hand-1"
        cards={cards}
        revealed={4}
        onFullRevealComplete={onFullRevealComplete}
      />,
    );

    expect(screen.queryByTestId('face-Q')).toBeNull();
    expect(screen.queryByTestId('face-J')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('face-Q')).not.toBeNull();
    expect(screen.queryByTestId('face-J')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(720);
    });
    expect(screen.getByTestId('face-J')).not.toBeNull();
    expect(onFullRevealComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onFullRevealComplete).toHaveBeenCalledTimes(1);
    expect(onFullRevealComplete).toHaveBeenLastCalledWith('hand-1');
  });

  it('reconciles an already-revealed hand without replaying the animation', () => {
    const onFullRevealComplete = vi.fn();

    render(
      <HolmCanonicalCommunityRow
        handContextId="hand-rejoin"
        cards={cards}
        revealed={4}
        onFullRevealComplete={onFullRevealComplete}
      />,
    );

    expect(screen.getByTestId('face-Q')).not.toBeNull();
    expect(screen.getByTestId('face-J')).not.toBeNull();
    expect(onFullRevealComplete).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runAllTimers();
    });
    expect(onFullRevealComplete).toHaveBeenCalledTimes(1);
  });
});
