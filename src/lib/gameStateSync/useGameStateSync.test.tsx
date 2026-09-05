// @vitest-environment jsdom

import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useGameStateSync } from './useGameStateSync';
import type { GameStateSyncHandle } from './types';
import type { AuthoritativeIdentity } from './authoritativeIdentityPure';

type TestState = {
  roundId: string | null;
  handNumber: number;
  roundNumber: number;
  status: string;
  _authorityRevision?: number;
  _authorityScope?: string;
  deadline?: string;
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

let latestHandle: GameStateSyncHandle<TestState | null> | null = null;
let latestPresentation: TestState | null = null;
let presentationRenderCount = 0;

function HookHarness({
  initialState,
  identity = null,
  identityResetState,
}: {
  initialState: TestState | null;
  identity?: AuthoritativeIdentity | null;
  identityResetState?: TestState | null;
}) {
  const handle = useGameStateSync<TestState | null>(initialState, {
    getProgress,
    identity,
    identityResetState,
  });

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
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
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

  it('retains current metadata against delayed equal-progress frames and admits a later revision', async () => {
    const current = { ...INITIAL_STATE, _authorityScope: 'session', _authorityRevision: 10, deadline: 'new' };
    await act(async () => { latestHandle!.reset(current); });
    await act(async () => {
      expect(latestHandle!.receiveAuthoritativeUpdate({ ...current, _authorityRevision: 9, deadline: 'old' }).accepted).toBe(false);
      expect(latestHandle!.receiveAuthoritativeUpdate({ ...current, deadline: 'conflict' }).accepted).toBe(false);
    });
    expect(latestHandle!.authoritativeState).toEqual(current);
    await act(async () => {
      expect(latestHandle!.receiveAuthoritativeUpdate({ ...current, _authorityRevision: 11, deadline: 'resumed' }).accepted).toBe(true);
    });
    expect(latestPresentation?.deadline).toBe('resumed');
  });

  it('forces the first equal post-reset snapshot to hydrate presentation once', async () => {
    await act(async () => {
      latestHandle!.reset(RESET_STATE);
    });

    const renderCountAfterReset = presentationRenderCount;
    let firstResult: ReturnType<GameStateSyncHandle<TestState | null>['receiveAuthoritativeUpdate']> | null = null;

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
    let secondResult: ReturnType<GameStateSyncHandle<TestState | null>['receiveAuthoritativeUpdate']> | null = null;

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

  it('treats identity → null as an explicit boundary reset, not a hold-current no-op', async () => {
    const identityA: AuthoritativeIdentity = { dealerGameId: 'dealer-a', handNumber: 1, roundId: 'round-a' };

    await act(async () => {
      root.render(
        <HookHarness
          initialState={INITIAL_STATE}
          identity={identityA}
          identityResetState={null}
        />,
      );
    });
    expect(latestPresentation).toEqual(INITIAL_STATE);

    await act(async () => {
      root.render(
        <HookHarness
          initialState={INITIAL_STATE}
          identity={null}
          identityResetState={null}
        />,
      );
    });

    expect(latestPresentation).toBeNull();
    expect(latestHandle!.presentationIdentity).toBeNull();
  });

  it('hydrates cleanly from null boundary into the next dealer-game identity', async () => {
    const identityA: AuthoritativeIdentity = { dealerGameId: 'dealer-a', handNumber: 1, roundId: 'round-a' };
    const identityB: AuthoritativeIdentity = { dealerGameId: 'dealer-b', handNumber: 1, roundId: 'round-b' };

    await act(async () => {
      root.render(<HookHarness initialState={INITIAL_STATE} identity={identityA} identityResetState={null} />);
    });
    await act(async () => {
      root.render(<HookHarness initialState={INITIAL_STATE} identity={null} identityResetState={null} />);
    });
    await act(async () => {
      root.render(<HookHarness initialState={INITIAL_STATE} identity={identityB} identityResetState={null} />);
    });

    expect(latestPresentation).toBeNull();
    expect(latestHandle!.presentationIdentity).toEqual(identityB);

    let result: ReturnType<GameStateSyncHandle<TestState | null>['receiveAuthoritativeUpdate']> | null = null;
    await act(async () => {
      result = latestHandle!.receiveAuthoritativeUpdate(RESET_STATE);
    });

    expect(result).toMatchObject({ accepted: true, presentationAction: 'written' });
    expect(latestPresentation).toEqual(RESET_STATE);
  });
});
