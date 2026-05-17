/**
 * Phase 5 lifecycle test: outer PersistentTableShell instance is stable
 * across simulated game.status transitions while inner phase-keyed
 * children remount. Verifies that shell-mounted telemetry fires exactly
 * once for the outer shell over the full transition sequence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { PersistentTableShell } from './PersistentTableShell';

vi.mock('@/lib/persistSyncDebugEvent', () => ({
  persistSyncDebugEvent: vi.fn().mockResolvedValue(undefined),
  persistTransition: vi.fn().mockResolvedValue(undefined),
}));

import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function PhaseKeyedChild({ phase }: { phase: string }) {
  return <div data-phase={phase} data-key-mount="x" />;
}

function Harness() {
  const [phase, setPhase] = useState('dealer_selection');
  return (
    <>
      <button data-testid="next" onClick={() => setPhase(p =>
        p === 'dealer_selection' ? 'game_selection'
          : p === 'game_selection' ? 'in_progress'
          : p === 'in_progress' ? 'game_over' : 'in_progress'
      )} />
      <PersistentTableShell gameId="g1" gameType="holm-game">
        {/* phase-keyed inner child models the existing MobileGameTable
            mount points which remount per game.status */}
        <PhaseKeyedChild key={phase} phase={phase} />
      </PersistentTableShell>
    </>
  );
}

describe('PersistentTableShell — Phase 5 lifecycle stability', () => {
  it('outer shell stays mounted across phase transitions; phase-keyed children remount', async () => {
    const { container, getByTestId } = render(<Harness />);
    const rootBefore = container.querySelector('[data-canonical-shell-root]');
    expect(rootBefore).not.toBeNull();

    const next = getByTestId('next');
    await act(async () => { next.click(); });
    await act(async () => { next.click(); });
    await act(async () => { next.click(); });

    const rootAfter = container.querySelector('[data-canonical-shell-root]');
    // Same DOM node identity ⇒ shell did not remount.
    expect(rootAfter).toBe(rootBefore);

    // Allow lazy persist import microtasks to flush.
    await Promise.resolve();
    await Promise.resolve();

    const calls = (persistSyncDebugEvent as any).mock.calls as any[];
    const mountCalls = calls.filter(
      ([arg]) => arg?.eventName === 'canonical-shell-shell-mounted',
    );
    const unmountCalls = calls.filter(
      ([arg]) => arg?.eventName === 'canonical-shell-shell-unmounted',
    );
    expect(mountCalls.length).toBe(1);
    expect(unmountCalls.length).toBe(0);
  });
});
