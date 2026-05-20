// @vitest-environment jsdom

/**
 * PersistentTableShell — Phase 4 scaffolding tests.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return { ...actual, recordShellEvent: vi.fn() };
});

import { PersistentTableShell } from './PersistentTableShell';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
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

describe('PersistentTableShell', () => {
  it('renders a transparent canonical-shell root wrapper', () => {
    act(() => {
      root.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <span data-testid="child">hello</span>
        </PersistentTableShell>,
      );
    });
    const child = container.querySelector('[data-testid="child"]') as HTMLElement;
    expect(child).toBeTruthy();
    const wrapper = child.closest('[data-canonical-shell-root]') as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute('data-canonical-shell-root')).toBe('');
    expect(wrapper!.getAttribute('data-shell-game-type')).toBe('cribbage');

  });

  it('does not mount SeatAnchorLayer when seats are not provided', () => {
    let saw: unknown = 'init';
    function Probe() {
      saw = useSeatAnchorsOptional();
      return null;
    }
    act(() => {
      root.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <Probe />
        </PersistentTableShell>,
      );
    });
    expect(saw).toBeNull();
  });

  it('mounts SeatAnchorLayer when projectionMode + seats provided', () => {
    let count = -1;
    function Probe() {
      const ctx = useSeatAnchorsOptional();
      count = ctx ? ctx.anchors.length : -1;
      return null;
    }
    act(() => {
      root.render(
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
    });
    expect(count).toBe(2);
  });

  it('emits shell-mounted once on mount and shell-unmounted once on unmount', () => {
    const localContainer = document.createElement('div');
    document.body.appendChild(localContainer);
    const localRoot = createRoot(localContainer);
    act(() => {
      localRoot.render(
        <PersistentTableShell gameId="g1" gameType="cribbage">
          <span />
        </PersistentTableShell>,
      );
    });
    const mock = recordShellEvent as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(mock.mock.calls.filter(c => c[0] === 'shell-unmounted')).toHaveLength(0);
    act(() => localRoot.unmount());
    expect(mock.mock.calls.filter(c => c[0] === 'shell-mounted')).toHaveLength(1);
    expect(mock.mock.calls.filter(c => c[0] === 'shell-unmounted')).toHaveLength(1);
    localContainer.remove();
  });
});
