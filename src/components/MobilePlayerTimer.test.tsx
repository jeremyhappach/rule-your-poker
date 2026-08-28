// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePlayerTimer } from './MobilePlayerTimer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe('MobilePlayerTimer countdown segment', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const renderTimer = (timeLeft: number) => {
    act(() => {
      root.render(
        <MobilePlayerTimer timeLeft={timeLeft} maxTime={10} isActive>
          <span>chip</span>
        </MobilePlayerTimer>,
      );
    });
  };

  const dashOffset = () => {
    const timerCircle = container.querySelector('[data-mobile-player-timer-progress]');
    expect(timerCircle).not.toBeNull();
    return Number(timerCircle!.getAttribute('stroke-dashoffset'));
  };

  it('renders one colored foreground arc without a masking full-circle overlay', () => {
    renderTimer(10);

    const timer = container.querySelector('[data-mobile-player-timer]');
    expect(timer).not.toBeNull();
    expect(timer!.children).toHaveLength(2);
    expect(timer!.querySelectorAll('[data-mobile-player-timer-progress]')).toHaveLength(1);
    expect(timer!.querySelectorAll('[data-mobile-player-timer-track]')).toHaveLength(1);
  });

  it('keeps one immutable segment while incoming time-left props tick', () => {
    renderTimer(10);
    const initial = dashOffset();

    act(() => vi.advanceTimersByTime(1_100));
    const afterFirstSecond = dashOffset();
    expect(afterFirstSecond).toBeGreaterThan(initial);

    renderTimer(9);
    act(() => vi.advanceTimersByTime(1_000));
    const afterPropTick = dashOffset();
    expect(afterPropTick).toBeGreaterThan(afterFirstSecond);
  });
});
