// @vitest-environment jsdom
import type { RefObject } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./SweepTheLegsAnimation', () => ({
  SweepTheLegsAnimation: () => null,
}));

vi.mock('@/lib/canonicalShell/chipEndpoints', () => ({
  resolveChipEndpoint: ({ ref }: { ref: { position: number } }) => ({
    x: ref.position * 10,
    y: ref.position * 10,
  }),
}));

vi.mock('@/lib/threeFiveSeven/wartime', () => ({
  emitPresentationLifecycle: vi.fn(),
}));

import { LegsToPlayerAnimation } from './LegsToPlayerAnimation';

const makeContainerRef = (): RefObject<HTMLDivElement> => {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  });
  document.body.appendChild(container);
  return { current: container };
};

const baseProps = {
  winnerPosition: 3,
  currentPlayerPosition: 3,
  getClockwiseDistance: (position: number) => position,
  legsToWin: 3,
  legValue: 1,
};

describe('LegsToPlayerAnimation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('completes immediately when only the winner has cached legs', () => {
    const onAnimationComplete = vi.fn();

    render(
      <LegsToPlayerAnimation
        {...baseProps}
        triggerId="winner-only"
        legPositions={[{ playerId: 'winner', position: 3, legCount: 2 }]}
        containerRef={makeContainerRef()}
        onAnimationComplete={onAnimationComplete}
      />,
    );

    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });

  it('preserves the timed sweep when an opponent has a leg to transfer', () => {
    vi.useFakeTimers();
    const onAnimationComplete = vi.fn();

    render(
      <LegsToPlayerAnimation
        {...baseProps}
        triggerId="opponent-leg"
        legPositions={[
          { playerId: 'winner', position: 3, legCount: 2 },
          { playerId: 'opponent', position: 5, legCount: 1 },
        ]}
        containerRef={makeContainerRef()}
        onAnimationComplete={onAnimationComplete}
      />,
    );

    expect(onAnimationComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3599));
    expect(onAnimationComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });
});
