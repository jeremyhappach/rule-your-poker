// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dealRuntime = vi.hoisted(() => ({
  gameType: 'holm-game',
  handContextId: 'timer-hand-1',
  phase: 'GAMEPLAY',
  dealSettled: true,
  readyReleased: true,
  timerAllowed: true,
}));

vi.mock('@/lib/canonicalShell/cardTransport/DealRuntime', () => ({
  useDealRuntime: () => dealRuntime,
}));

vi.mock('@/lib/canonicalShell/cardTransport/holmFullForensics', () => ({
  ffArmTimerBarSampler: vi.fn(),
  ffRecord: vi.fn(),
}));

vi.mock('@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore', () => ({
  recordThreeFiveSevenTimerOwner: vi.fn(),
  unregisterThreeFiveSevenTimerOwner: vi.fn(),
}));

vi.mock('@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics', () => ({
  record357DiagnosticViolation: vi.fn(),
}));

import {
  ShellTimerProvider,
  ShellTimerRail,
  type ShellTimerState,
  useShellTimer,
} from './ShellTimerRail';

let container: HTMLDivElement;
let root: Root;
let nextRafId: number;
let rafCallbacks: Map<number, FrameRequestCallback>;

function Publisher({ state }: { state: ShellTimerState }) {
  useShellTimer(state);
  return null;
}

function renderTimer(state: ShellTimerState) {
  act(() => {
    root.render(
      <ShellTimerProvider>
        <Publisher state={state} />
        <ShellTimerRail />
      </ShellTimerProvider>,
    );
  });
}

function timerFill(): HTMLDivElement {
  const rail = container.querySelector('[data-canonical-shell-timer-rail]');
  const fill = rail?.querySelector<HTMLDivElement>('div[style*="width"]');
  if (!fill) throw new Error('timer fill not rendered');
  return fill;
}

function flushAnimationFrames() {
  const callbacks = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  act(() => callbacks.forEach(callback => callback(0)));
}

beforeEach(() => {
  dealRuntime.gameType = 'holm-game';
  dealRuntime.handContextId = 'timer-hand-1';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  nextRafId = 1;
  rafCallbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('ShellTimerRail Holm epoch presentation', () => {
  it('starts each deadline full without transition, then only descends', () => {
    renderTimer({
      secondsRemaining: 21,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-a-player-a',
    });

    expect(timerFill().style.width).toBe('100%');
    expect(timerFill().className).not.toContain('transition-[width]');

    flushAnimationFrames();
    expect(timerFill().className).toContain('transition-[width]');

    renderTimer({
      secondsRemaining: 20,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-a-player-a',
    });
    expect(Number.parseFloat(timerFill().style.width)).toBeCloseTo((20 / 21) * 100);
    expect(timerFill().className).toContain('transition-[width]');

    renderTimer({
      secondsRemaining: 14,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-b-player-a',
    });
    expect(timerFill().style.width).toBe('100%');
    expect(timerFill().className).not.toContain('transition-[width]');
  });
});

describe('ShellTimerRail 3-5-7 epoch presentation', () => {
  it('starts the first deal-settled frame full and descends within the exact deadline', () => {
    dealRuntime.gameType = '3-5-7';

    renderTimer({
      secondsRemaining: 21,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-a-player-a',
    });

    expect(timerFill().style.width).toBe('100%');
    expect(timerFill().className).not.toContain('transition-[width]');

    flushAnimationFrames();
    renderTimer({
      secondsRemaining: 20,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-a-player-a',
    });

    expect(Number.parseFloat(timerFill().style.width)).toBeCloseTo((20 / 21) * 100);
    expect(timerFill().className).toContain('transition-[width]');

    renderTimer({
      secondsRemaining: 14,
      totalSeconds: 30,
      activePlayerId: 'player-a',
      identityKey: 'turn-deadline-b-player-a',
    });

    expect(timerFill().style.width).toBe('100%');
    expect(timerFill().className).not.toContain('transition-[width]');
  });
});
