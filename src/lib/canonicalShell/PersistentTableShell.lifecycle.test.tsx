// @vitest-environment jsdom

/**
 * Phase 5 lifecycle test: outer PersistentTableShell instance is stable
 * across simulated game.status transitions while inner phase-keyed
 * children remount. Verifies that recordShellEvent('shell-mounted') is
 * fired exactly once for the outer shell over the transition sequence.
 */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return { ...actual, recordShellEvent: vi.fn() };
});

import { PersistentTableShell } from './PersistentTableShell';
import { recordShellEvent } from './diagnostics';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

let setPhaseExt: ((p: string) => void) | null = null;

function Harness() {
  const [phase, setPhase] = useState('dealer_selection');
  setPhaseExt = setPhase;
  return (
    <PersistentTableShell gameId="g1" gameType="holm-game">
      <div key={phase} data-phase={phase} />
    </PersistentTableShell>
  );
}

describe('PersistentTableShell — Phase 5 lifecycle stability', () => {
  it('outer shell survives phase transitions; phase-keyed children remount', () => {
    act(() => { root.render(<Harness />); });
    const rootBefore = container.querySelector('[data-canonical-shell-root]');
    expect(rootBefore).not.toBeNull();
    expect(container.querySelector('[data-phase="dealer_selection"]')).not.toBeNull();

    act(() => { setPhaseExt!('game_selection'); });
    act(() => { setPhaseExt!('in_progress'); });
    act(() => { setPhaseExt!('game_over'); });

    const rootAfter = container.querySelector('[data-canonical-shell-root]');
    // Same DOM node identity ⇒ shell did not remount.
    expect(rootAfter).toBe(rootBefore);
    expect(container.querySelector('[data-phase="game_over"]')).not.toBeNull();

    const mock = recordShellEvent as unknown as ReturnType<typeof vi.fn>;
    const mountCalls = mock.mock.calls.filter(([name]) => name === 'shell-mounted');
    const unmountCalls = mock.mock.calls.filter(([name]) => name === 'shell-unmounted');
    expect(mountCalls.length).toBe(1);
    expect(unmountCalls.length).toBe(0);
  });
});
