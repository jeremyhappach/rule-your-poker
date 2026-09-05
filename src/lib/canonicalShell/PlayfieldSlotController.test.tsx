// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return {
    ...actual,
    recordShellEvent: vi.fn(),
    checkSlotTransition: vi.fn(() => true),
  };
});

import { PlayfieldSlotController } from './PlayfieldSlotController';
import { recordShellEvent, checkSlotTransition } from './diagnostics';

let container: HTMLDivElement;
let root: Root;

const DWELL = 50;

beforeEach(() => {
  vi.useFakeTimers();
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  (checkSlotTransition as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const A = { gameType: 'holm-game', dealerGameId: 'dA' };
const B = { gameType: 'horses', dealerGameId: 'dB' };

function render(id: typeof A | typeof B | null) {
  act(() => {
    root.render(
      <PlayfieldSlotController desiredIdentity={id} interstitialDwellMs={DWELL}>
        <div data-testid="child" />
      </PlayfieldSlotController>,
    );
  });
}

const isNeutral = () =>
  container.querySelector('[data-canonical-shell-neutral]') !== null;
const isActive = () =>
  container.querySelector('[data-testid="child"]') !== null;

describe('PlayfieldSlotController', () => {
  it('cold start null → identity mounts directly without neutral', () => {
    render(null);
    expect(isNeutral()).toBe(true);
    render(A);
    expect(isActive()).toBe(true);
    expect(isNeutral()).toBe(false);
  });

  it('identity → different identity passes through neutral with dwell', () => {
    render(A);
    expect(isActive()).toBe(true);

    render(B);
    // Immediately after desired change: neutral mounted, child gone.
    expect(isNeutral()).toBe(true);
    expect(isActive()).toBe(false);

    act(() => { vi.advanceTimersByTime(DWELL - 1); });
    expect(isNeutral()).toBe(true);

    act(() => { vi.advanceTimersByTime(2); });
    expect(isActive()).toBe(true);
    expect(isNeutral()).toBe(false);

    const slot = container.querySelector('[data-canonical-shell-slot]');
    expect(slot?.getAttribute('data-slot-identity')).toBe('horses/dB');
  });

  it('same identity re-render is a no-op (no neutral flash)', () => {
    render(A);
    render(A);
    expect(isActive()).toBe(true);
    expect(isNeutral()).toBe(false);
  });

  it('identity → null holds neutral indefinitely', () => {
    render(A);
    render(null);
    expect(isNeutral()).toBe(true);
    act(() => { vi.advanceTimersByTime(DWELL * 5); });
    expect(isNeutral()).toBe(true);
  });

  it('does not raise INV-shell-3 (slot-transition-without-neutral) on rollover', () => {
    render(A);
    render(B);
    act(() => { vi.advanceTimersByTime(DWELL + 5); });

    const violations = (checkSlotTransition as unknown as ReturnType<typeof vi.fn>)
      .mock.calls.filter(([prev, next]) => prev !== null && next !== null);
    expect(violations.length).toBe(0);
  });

  it('child subtree re-keys on identity change (fresh mount)', () => {
    render(A);
    const slotA = container.querySelector('[data-testid="child"]')?.parentElement;
    render(B);
    act(() => { vi.advanceTimersByTime(DWELL + 5); });
    const slotB = container.querySelector('[data-testid="child"]')?.parentElement;
    expect(slotB).not.toBe(slotA);
    expect(container.querySelector('[data-canonical-shell-slot]')?.getAttribute('data-slot-identity')).toBe('horses/dB');
  });
});
