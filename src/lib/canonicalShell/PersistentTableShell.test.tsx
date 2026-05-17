/**
 * PersistentTableShell — Phase 4 scaffolding tests.
 *
 * Verifies the shell mounts as a transparent wrapper, stamps the
 * expected data attributes, optionally composes SeatAnchorLayer when
 * seat inputs are provided, and emits mount/unmount telemetry once
 * per shell instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('./diagnostics', () => ({
  recordShellEvent: vi.fn(),
}));

import { PersistentTableShell } from './PersistentTableShell';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { recordShellEvent } from './diagnostics';

beforeEach(() => {
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  cleanup();
});

describe('PersistentTableShell', () => {
  it('renders a transparent canonical-shell root wrapper', () => {
    render(
      <PersistentTableShell gameId="g1" gameType="cribbage">
        <span data-testid="child">hello</span>
      </PersistentTableShell>,
    );
    const child = screen.getByTestId('child');
    const root = child.parentElement!;
    expect(root.getAttribute('data-canonical-shell-root')).toBe('');
    expect(root.getAttribute('data-shell-game-type')).toBe('cribbage');
  });

  it('does not mount SeatAnchorLayer when seats are not provided', () => {
    function Probe() {
      const ctx = useSeatAnchorsOptional();
      return <span data-testid="probe">{ctx ? 'yes' : 'no'}</span>;
    }
    render(
      <PersistentTableShell gameId="g1" gameType="cribbage">
        <Probe />
      </PersistentTableShell>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('no');
  });

  it('mounts SeatAnchorLayer when projectionMode + seats provided', () => {
    function Probe() {
      const ctx = useSeatAnchorsOptional();
      return <span data-testid="probe">{ctx ? `n=${ctx.anchors.length}` : 'no'}</span>;
    }
    render(
      <PersistentTableShell
        gameId="g1"
        gameType="horses"
        projectionMode="observer-absolute"
        viewerPosition={null}
        seats={[
          { position: 1, occupied: true },
          { position: 2, occupied: true },
        ]}
      >
        <Probe />
      </PersistentTableShell>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('n=2');
  });

  it('emits shell-mounted on mount and shell-unmounted on unmount, once each', () => {
    const { unmount } = render(
      <PersistentTableShell gameId="g1" gameType="cribbage">
        <span />
      </PersistentTableShell>,
    );
    const calls = (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(calls.filter(c => c[0] === 'shell-unmounted')).toHaveLength(0);
    unmount();
    const after = (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(after.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(after.filter(c => c[0] === 'shell-unmounted')).toHaveLength(1);
  });
});
