// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cribbageAuthority', () => ({
  prepareCribbageDealerSelection: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/debugEventLogger', () => ({
  logDebugEvent: vi.fn(),
}));

vi.mock('@/lib/dealerSelectionDiag', () => ({
  recordDealerSelectionDiag: vi.fn(),
}));

vi.mock('@/lib/canonicalShell/waitingTableFlight', () => ({
  recordWaitingLifecycle: vi.fn(),
  recordWaitingLifecycleIfChanged: vi.fn(),
}));

vi.mock('@/lib/wartimeDebug/surfaces', () => ({
  recordHighCardSurfaceMount: vi.fn(),
  recordHighCardSurfaceUnmount: vi.fn(),
  recordHighCardRender: vi.fn(),
  recordHighCardStateRaw: vi.fn(),
  recordHighCardRenderRaw: vi.fn(),
  recordHighCardTimer: vi.fn(),
  recordHighCardCardsClear: vi.fn(),
  recordHighCardStateSource: vi.fn(),
  recordHighCardVisibleRenderer: vi.fn(),
  recordHighCardPhaseTransition: vi.fn(),
  recordHighCardWriter: vi.fn(),
  resetHighCardVisibleRendererCache: vi.fn(),
  resetHighCardPhaseCache: vi.fn(),
}));

vi.mock('@/lib/wartimeDebug/highCardVisualSampler', () => ({
  startHighCardVisualSampler: vi.fn(),
  stopHighCardVisualSampler: vi.fn(),
}));

import {
  getDealerSelectionReceiptKey,
  type DealerSelectionState,
  useHighCardDealerSelection,
} from './useHighCardDealerSelection';

const players = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '10000000-0000-0000-0000-000000000001',
    position: 1,
    profiles: { username: 'One' },
    is_bot: false,
    sitting_out: false,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    user_id: '10000000-0000-0000-0000-000000000002',
    position: 2,
    profiles: { username: 'Two' },
    is_bot: false,
    sitting_out: false,
  },
];

const completeState = (): DealerSelectionState => ({
  cards: [
    {
      playerId: '00000000-0000-0000-0000-000000000001',
      position: 1,
      card: { rank: 'K', suit: '♣' },
      isRevealed: true,
      isWinner: true,
      isDimmed: false,
      roundNumber: 1,
    },
  ],
  announcement: 'Dealer selected',
  isComplete: true,
  winnerPosition: 1,
  preparedAt: '2026-08-16T17:20:20.435Z',
});

type HookProps = Parameters<typeof useHighCardDealerSelection>[0];

function createProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    gameId: 'game-1',
    players,
    onComplete: vi.fn(),
    isHost: true,
    selectionVariant: 'cribbage',
    syncedState: null,
    onCardsUpdate: vi.fn(),
    onWinnerPositionUpdate: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('getDealerSelectionReceiptKey', () => {
  it('deduplicates semantically identical realtime and refetch snapshots', () => {
    expect(getDealerSelectionReceiptKey(completeState())).toBe(
      getDealerSelectionReceiptKey(structuredClone(completeState())),
    );
  });

  it('accepts a new prepared dealer-selection identity', () => {
    const next = completeState();
    next.preparedAt = '2026-08-16T17:21:20.435Z';

    expect(getDealerSelectionReceiptKey(next)).not.toBe(
      getDealerSelectionReceiptKey(completeState()),
    );
  });
});

describe('Cribbage durable dealer-selection completion', () => {
  it('drains a complete receipt that arrives after initialization', () => {
    const props = createProps();
    const { rerender } = renderHook(
      (nextProps: HookProps) => useHighCardDealerSelection(nextProps),
      { initialProps: props },
    );

    const receipt = completeState();
    act(() => rerender({ ...props, syncedState: receipt }));

    expect(props.onCardsUpdate).toHaveBeenLastCalledWith(receipt.cards);
    expect(props.onWinnerPositionUpdate).toHaveBeenLastCalledWith(1);
    expect(props.onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(2_199));
    expect(props.onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(props.onComplete).toHaveBeenCalledTimes(1);
    expect(props.onComplete).toHaveBeenLastCalledWith(1);
  });

  it('deduplicates an exact receipt across realtime, refetch, and transient absence', () => {
    const props = createProps();
    const { rerender } = renderHook(
      (nextProps: HookProps) => useHighCardDealerSelection(nextProps),
      { initialProps: props },
    );

    act(() => rerender({ ...props, syncedState: completeState() }));
    act(() => rerender({ ...props, syncedState: structuredClone(completeState()) }));
    act(() => vi.advanceTimersByTime(2_200));
    expect(props.onComplete).toHaveBeenCalledTimes(1);

    act(() => rerender({ ...props, syncedState: null }));
    act(() => rerender({ ...props, syncedState: structuredClone(completeState()) }));
    act(() => vi.advanceTimersByTime(2_200));

    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps non-host receipt handling presentation-only', () => {
    const props = createProps({ isHost: false, syncedState: completeState() });
    renderHook((nextProps: HookProps) => useHighCardDealerSelection(nextProps), {
      initialProps: props,
    });

    act(() => vi.advanceTimersByTime(2_200));

    expect(props.onCardsUpdate).toHaveBeenLastCalledWith(completeState().cards);
    expect(props.onWinnerPositionUpdate).toHaveBeenLastCalledWith(1);
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('cancels the local handoff when authoritative recovery removes the receipt', () => {
    const props = createProps();
    const { rerender } = renderHook(
      (nextProps: HookProps) => useHighCardDealerSelection(nextProps),
      { initialProps: props },
    );

    act(() => rerender({ ...props, syncedState: completeState() }));
    act(() => vi.advanceTimersByTime(1_000));
    act(() => rerender({ ...props, syncedState: null }));
    act(() => vi.advanceTimersByTime(5_000));

    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('uses the latest callback without restarting the presentation dwell', () => {
    const firstComplete = vi.fn();
    const latestComplete = vi.fn();
    const props = createProps({ onComplete: firstComplete });
    const { rerender } = renderHook(
      (nextProps: HookProps) => useHighCardDealerSelection(nextProps),
      { initialProps: props },
    );

    act(() => rerender({ ...props, syncedState: completeState() }));
    act(() => vi.advanceTimersByTime(1_000));
    act(() =>
      rerender({ ...props, syncedState: structuredClone(completeState()), onComplete: latestComplete }),
    );
    act(() => vi.advanceTimersByTime(1_200));

    expect(firstComplete).not.toHaveBeenCalled();
    expect(latestComplete).toHaveBeenCalledTimes(1);
  });

  it('resets receipt dedupe at the dealer-game boundary', () => {
    const props = createProps({ syncedState: completeState() });
    const { rerender } = renderHook(
      (nextProps: HookProps) => useHighCardDealerSelection(nextProps),
      { initialProps: props },
    );

    act(() => vi.advanceTimersByTime(2_200));
    expect(props.onComplete).toHaveBeenCalledTimes(1);

    act(() => rerender({ ...props, gameId: 'game-2', syncedState: structuredClone(completeState()) }));
    act(() => vi.advanceTimersByTime(2_200));

    expect(props.onComplete).toHaveBeenCalledTimes(2);
  });
});
