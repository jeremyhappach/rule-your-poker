// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CanonicalAnnouncementProvider,
  useAnnouncementContext,
  useAnnouncements,
} from './CanonicalAnnouncementProvider';
import { CanonicalAnnouncementLayer } from './CanonicalAnnouncementLayer';
import { recordShellEvent } from '../diagnostics';

vi.mock('../diagnostics', () => ({ recordShellEvent: vi.fn() }));

type AnnouncementApi = ReturnType<typeof useAnnouncements>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let api: AnnouncementApi | null;

function Harness() {
  api = useAnnouncements();
  const context = useAnnouncementContext();
  return (
    <>
      <CanonicalAnnouncementLayer />
      <output data-testid="active-announcement">
        {context?.active?.id ?? 'none'}
      </output>
    </>
  );
}

beforeEach(() => {
  vi.mocked(recordShellEvent).mockClear();
  api = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <CanonicalAnnouncementProvider dealerGameId="game-1">
        <Harness />
      </CanonicalAnnouncementProvider>,
    );
  });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const emitTax = (onRetired?: () => void) => {
  api!.emit({
    id: 'round_win:357-tax:cursor-4',
    type: 'round_win',
    scope: { dealerGameId: 'game-1', roundId: null },
    payload: { text: 'Pussy Tax!', kind: 'pussy_tax', handNumber: 1, transferCursor: 4 },
    ttlMs: 60_000,
    transientScope: '357-tax:cursor-4',
    onRetired,
  });
};

const emitReAnte = () => {
  api!.emit({
    id: 'peg:357-re-ante:cursor-5',
    type: 'peg_notice',
    scope: { dealerGameId: 'game-1', roundId: null },
    payload: { title: 'Re-Ante', kind: 'reante', handNumber: 2, transferCursor: 5 },
    ttlMs: 60_000,
    transientScope: '357-re-ante:cursor-5',
  });
};

describe('CanonicalAnnouncementProvider transient scope handoff', () => {
  it('retires the live scope synchronously before a lower-priority successor emits', () => {
    const taxRetired = vi.fn();
    act(() => {
      api!.emit({
        id: 'ambient',
        type: 'waiting_for_players',
        scope: { dealerGameId: 'game-1', roundId: null },
        behavior: 'ambient',
      });
      emitTax(taxRetired);
    });
    expect(container.textContent).toContain('Pussy Tax!');

    let retiredBeforeSuccessorEmit = false;
    act(() => {
      // Keep React work pending on the provider. The synchronous retirement
      // contract must not depend on React eagerly running a state updater.
      api!.clearAmbient('waiting_for_players');
      api!.retireTransientScope('357-tax:cursor-4');
      retiredBeforeSuccessorEmit = taxRetired.mock.calls.length === 1;
      emitReAnte();
    });

    expect(retiredBeforeSuccessorEmit).toBe(true);
    expect(taxRetired).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Re-Ante');
    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('peg:357-re-ante:cursor-5');
    const evidence = vi.mocked(recordShellEvent).mock.calls
      .filter(([eventName]) => eventName === 'announcement-lifecycle')
      .map(([, payload]) => payload.detail);
    expect(evidence).toContainEqual(expect.objectContaining({
      stage: 'retired',
      eventId: 'round_win:357-tax:cursor-4',
      reason: 'scope-retire',
    }));
    expect(evidence).toContainEqual(expect.objectContaining({
      stage: 'disposition',
      eventId: 'peg:357-re-ante:cursor-5',
      disposition: 'promote-immediate',
    }));
    expect(evidence).toContainEqual(expect.objectContaining({
      stage: 'painted',
      eventId: 'peg:357-re-ante:cursor-5',
    }));
  });

  it('promotes an unrelated queued priority owner before admitting the successor', async () => {
    act(() => {
      emitTax();
      api!.emit({
        id: 'unrelated-chip-award',
        type: 'chip_award',
        scope: { dealerGameId: 'game-1', roundId: null },
        payload: { text: 'Unrelated award' },
        ttlMs: 60_000,
        transientScope: 'unrelated',
      });
      api!.retireTransientScope('357-tax:cursor-4');
      emitReAnte();
    });

    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('unrelated-chip-award');

    await act(async () => {
      api!.retireTransientScope('unrelated');
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('peg:357-re-ante:cursor-5');
  });

  it('retires every Cribbage target event exactly once before the next target emits', () => {
    const retiredFirst = vi.fn();
    const retiredSecond = vi.fn();
    act(() => {
      api!.emit({
        id: 'cribbage-target-1-combo-1',
        type: 'peg_notice',
        scope: { dealerGameId: 'game-1', roundId: 'round-1' },
        payload: { title: 'Player 1: Pair for 2' },
        ttlMs: 60_000,
        transientScope: 'cribbage-count:game-1:round-1:1',
        onRetired: retiredFirst,
      });
      api!.emit({
        id: 'cribbage-target-1-total',
        type: 'peg_notice',
        scope: { dealerGameId: 'game-1', roundId: 'round-1' },
        payload: { title: 'Player 1: Total 2' },
        ttlMs: 60_000,
        transientScope: 'cribbage-count:game-1:round-1:1',
        onRetired: retiredSecond,
      });
    });

    act(() => {
      api!.retireTransientScope('cribbage-count:game-1:round-1:1');
      api!.emit({
        id: 'cribbage-target-2-combo-1',
        type: 'peg_notice',
        scope: { dealerGameId: 'game-1', roundId: 'round-1' },
        payload: { title: 'Player 2: Fifteen for 2' },
        ttlMs: 60_000,
        transientScope: 'cribbage-count:game-1:round-1:2',
      });
    });

    expect(retiredFirst).toHaveBeenCalledTimes(1);
    expect(retiredSecond).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('cribbage-target-2-combo-1');
  });

  it('makes the authoritative paused ambient immediately outrank a live gameplay transient', () => {
    act(() => {
      emitTax();
      api!.emit({
        id: 'game-1:session-paused:host-1',
        type: 'game_paused',
        scope: { dealerGameId: 'game-1', roundId: null },
        behavior: 'ambient',
        payload: { hostName: 'Host' },
      });
    });

    expect(container.querySelector('[data-testid="active-announcement"]')?.textContent)
      .toBe('game-1:session-paused:host-1');
    expect(container.textContent).toContain('Game is paused');
  });
});
