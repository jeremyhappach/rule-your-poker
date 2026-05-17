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

import { useSlotIdentityTracker } from './useSlotIdentityTracker';
import { recordShellEvent, checkSlotTransition } from './diagnostics';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  (checkSlotTransition as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Probe(props: { gameId?: string | null; gameType?: string | null; dealerGameId?: string | null }) {
  useSlotIdentityTracker(props);
  return null;
}

const calls = () => (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mock.calls
  .filter(([name]) => name === 'slot-identity-changed');

describe('useSlotIdentityTracker', () => {
  it('does not fire on initial null identity', () => {
    act(() => { root.render(<Probe gameId="g1" gameType={null} dealerGameId={null} />); });
    expect(calls().length).toBe(0);
  });

  it('fires once on null → identity transition', () => {
    act(() => { root.render(<Probe gameId="g1" gameType={null} dealerGameId={null} />); });
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d1" />); });
    expect(calls().length).toBe(1);
  });

  it('fires on identity → identity transition and triggers invariant check', () => {
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d1" />); });
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d2" />); });
    expect(calls().length).toBe(2); // null→d1, d1→d2
    expect((checkSlotTransition as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not fire on same identity re-render', () => {
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d1" />); });
    const before = calls().length;
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d1" />); });
    expect(calls().length).toBe(before);
  });

  it('fires on identity → null (neutral) transition', () => {
    act(() => { root.render(<Probe gameId="g1" gameType="holm-game" dealerGameId="d1" />); });
    act(() => { root.render(<Probe gameId="g1" gameType={null} dealerGameId={null} />); });
    expect(calls().length).toBe(2);
    const last = calls()[calls().length - 1][1];
    expect(last.detail.next).toBe(null);
  });
});
