// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStateSync } from './useGameStateSync';
import type { GameStateSyncHandle } from './types';

// Stub debug persistence so we don't try to write to Supabase in tests
vi.mock('@/lib/persistSyncDebugEvent', () => ({
  persistSyncDebugEvent: vi.fn(),
  isSyncDebugEnabled: () => false,
  refreshSyncDebugFlag: () => {},
}));

type S = { hand: number; phase: string; payload: number };

const init: S = { hand: 1, phase: 'play', payload: 0 };

let container: HTMLDivElement;
let root: Root;
let handle: GameStateSyncHandle<S> | null = null;

function Probe() {
  const h = useGameStateSync<S>(init, {
    getProgress: (s) => [s.hand, s.payload],
    debugLabel: 'visual-contract-test',
    gameType: 'test',
  });
  handle = h;
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<Probe />); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  handle = null;
  vi.useRealTimers();
});

describe('visual contract', () => {
  it('locks presentation while contract is active and flushes on complete', () => {
    expect(handle).toBeTruthy();
    const h = handle!;
    expect(h.presentationState.payload).toBe(0);

    let id: ReturnType<typeof h.beginVisualContract>;
    act(() => {
      id = h.beginVisualContract({
        type: 'reveal',
        identity: { gameId: 'g1', roundId: 'r1', handNumber: 1, phase: 'play' },
      });
    });

    // Authoritative advances during contract — presentation should NOT change
    act(() => {
      h.receiveAuthoritativeUpdate({ hand: 1, phase: 'complete', payload: 99 });
    });
    expect(handle!.presentationState.payload).toBe(0);
    expect(handle!.authoritativeState.payload).toBe(99);
    expect(handle!.isVisualContractActive).toBe(true);

    // Complete contract → presentation flushes to latest authoritative (99)
    act(() => {
      h.completeVisualContract(id!);
    });
    expect(handle!.presentationState.payload).toBe(99);
    expect(handle!.isVisualContractActive).toBe(false);
  });

  it('reset aborts active contract and clears buffer', () => {
    const h = handle!;
    let id: ReturnType<typeof h.beginVisualContract>;
    act(() => {
      id = h.beginVisualContract({
        type: 'reveal',
        identity: { gameId: 'g1', handNumber: 1 },
      });
    });
    act(() => {
      h.receiveAuthoritativeUpdate({ hand: 1, phase: 'x', payload: 50 });
    });
    expect(handle!.presentationState.payload).toBe(0);

    act(() => { h.reset({ hand: 2, phase: 'play', payload: 0 }); });
    expect(handle!.isVisualContractActive).toBe(false);
    expect(handle!.presentationState.hand).toBe(2);
  });

  it('rejects complete with mismatched identity', () => {
    const h = handle!;
    let id: ReturnType<typeof h.beginVisualContract>;
    act(() => {
      id = h.beginVisualContract({
        type: 'reveal',
        identity: { gameId: 'g1', handNumber: 1 },
      });
    });
    let result = true;
    act(() => {
      result = h.completeVisualContract({ ...id!, handNumber: 999 });
    });
    expect(result).toBe(false);
    expect(handle!.isVisualContractActive).toBe(true);
  });
});
