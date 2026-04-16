// @vitest-environment jsdom

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useGameStateSync } from './useGameStateSync';
import type { GameStateSyncHandle } from './types';

type TestState = {
  roundId: string | null;
  handNumber: number;
  roundNumber: number;
  status: string;
};

const INITIAL_STATE: TestState = {
  roundId: 'h4r1',
  handNumber: 4,
  roundNumber: 1,
  status: 'showdown',
};

const RESET_STATE: TestState = {
  roundId: 'c4912d0b',
  handNumber: 4,
  roundNumber: 2,
  status: 'waiting_for_action',
};

const getProgress = (state: TestState | null) => {
  if (!state) {
    return [0, 0, 0];
  }

  return [state.handNumber, state.roundNumber, state.status === 'waiting_for_action' ? 1 : 0];
};

let latestHandle: GameStateSyncHandle<TestState> | null = null;
let latestPresentation: TestState | null = null;
let presentationRenderCount = 0;

function HookHarness({ initialState }: { initialState: TestState }) {
  const handle = useGameStateSync(initialState, { getProgress });

  useLayoutEffect(() => {
    latestHandle = handle;
    latestPresentation = handle.presentationState;
    presentationRenderCount += 1;
  });

  return null;
}

describe('useGameStateSync reset hydration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    latestHandle = null;
    latestPresentation = null;
    presentationRenderCount = 0;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<HookHarness initialState={INITIAL_STATE} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
  });

  it('forces a fresh presentation object on reset', async () => {
    expect(latestHandle).not.toBeNull();

    await act(async () => {
      latestHandle!.reset(RESET_STATE);
    });

    expect(latestPresentation).toEqual(RESET_STATE);
    expect(latestPresentation).not.toBe(RESET_STATE);
    expect(latestHandle!.presentationRefValue).toBe(latestPresentation);
  });

  it('forces the first equal post-reset snapshot to hydrate presentation once', async () => {
    await act(async () => {
      latestHandle!.reset(RESET_STATE);
    });

    const renderCountAfterReset = presentationRenderCount;
    let firstResult: ReturnType<GameStateSyncHandle<TestState>['receiveAuthoritativeUpdate']> | null = null;

    await act(async () => {
      firstResult = latestHandle!.receiveAuthoritativeUpdate(RESET_STATE);
    });

    expect(firstResult).toMatchObject({
      accepted: true,
      reason: 'equal',
      presentationAction: 'written',
      comparison: 0,
    });
    expect(latestPresentation).toEqual(RESET_STATE);
    expect(latestPresentation).not.toBe(RESET_STATE);
    expect(presentationRenderCount).toBe(renderCountAfterReset + 1);

    const renderCountAfterFirstHydration = presentationRenderCount;
    let secondResult: ReturnType<GameStateSyncHandle<TestState>['receiveAuthoritativeUpdate']> | null = null;

    await act(async () => {
      secondResult = latestHandle!.receiveAuthoritativeUpdate(RESET_STATE);
    });

    expect(secondResult).toMatchObject({
      accepted: false,
      reason: 'identical',
      presentationAction: 'not-applicable',
      comparison: 0,
    });
    expect(presentationRenderCount).toBe(renderCountAfterFirstHydration);
  });
});