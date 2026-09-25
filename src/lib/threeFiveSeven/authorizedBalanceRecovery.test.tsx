// @vitest-environment jsdom
import { act, useCallback, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  batches: [] as any[], players: [] as any[], disclosed: false,
  requests: [] as number[], batchInsert: null as ((payload: any) => void) | null,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const data = () => table === 'players' ? db.players
      : table === 'games' ? { pot: 6, pot_transfer_cursor: 1 }
      : db.disclosed ? db.batches : [];
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
      maybeSingle: async () => {
        if (table !== 'gameplay_transfer_batches') return { data: data() };
        db.requests.push(filters.cursor as number);
        return { data: db.disclosed ? db.batches.find(batch =>
          batch.game_id === filters.game_id && batch.cursor === filters.cursor) ?? null : null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data() }).then(resolve),
    };
    return builder;
  },
  channel() {
    const channel = {
      on: (_type: string, config: { table: string }, callback: (payload: any) => void) => {
        if (config.table === 'gameplay_transfer_batches') db.batchInsert = callback;
        return channel;
      },
      subscribe: (callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel; },
    };
    return channel;
  },
  removeChannel: vi.fn(),
} }));

import {
  ChipTransportProvider, useChipPresentationBalanceDeltas, useChipPresentationCursorState,
  useChipTransferPresentationAdmission, usePresentationPlayerChipBalance,
} from '@/lib/canonicalShell/ChipTransportProvider';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import {
  buildThreeFiveSevenRevealedFinancialPresentation as build,
  getThreeFiveSevenLegChargeAdmission as admit,
  retainThreeFiveSevenFinancialPresentation as retain,
  type ThreeFiveSevenRevealedFinancialPresentation,
} from './financialPresentation';

const scope = { gameId: 'game-1', dealerGameId: 'dealer-1' };
const clock = (round = 1) => ({ serverOffsetMs: 0, window: {
  ...scope, id: `reveal-${round}`, roundId: `round-${round}`, handNumber: 1, roundNumber: round,
  startedAtMs: 0, countdownAtMs: 1000, dropAtMs: 3700, endsAtMs: 5300, continuationAtMs: 9300,
} });
type Frame = { round: number; completed: boolean; cursor: number; chips: number };
const leg = (cursor: number, opening: number): ChipPresentationBatch => ({
  id: `leg-${cursor}`, game_id: scope.gameId, dealer_game_id: scope.dealerGameId,
  cursor, reason: 'leg', transfers: [],
  opening_balances: { 'player:winner': opening }, closing_balances: { 'player:winner': opening - 2 },
});
const settled = vi.fn();
function Consumer({ frame, now, revealRound = frame.round }: { frame: Frame; now: number; revealRound?: number }) {
  const revealed = useMemo(() => build({ ...scope, roundId: `round-${frame.round}`,
    handNumber: 1, roundNumber: frame.round, transferCursor: frame.cursor,
    roundCompleted: frame.completed, revealClock: clock(revealRound), revealBlocked: now < 5300, nowMs: now,
  }), [frame, now, revealRound]);
  const retainedRef = useRef<ThreeFiveSevenRevealedFinancialPresentation | null>(null);
  const retained = retain(retainedRef.current, revealed, scope);
  retainedRef.current = retained;
  const admission = useCallback((batch: ChipPresentationBatch) => admit(batch, retained) ?? true, [retained]);
  useChipTransferPresentationAdmission(admission, settled);
  useChipPresentationCursorState(retained?.transferCursor ?? null);
  const balance = usePresentationPlayerChipBalance('winner', frame.chips);
  const deltas = useChipPresentationBalanceDeltas();
  return <><output data-balance>{balance}</output><output data-deltas>{deltas.map(delta => delta.amount).join(',')}</output></>;
}
let container: HTMLDivElement;
let root: Root;
const render = async (frame: Frame, now: number, revealRound?: number) => {
  await act(async () => { root.render(<ChipTransportProvider gameId={scope.gameId} gameType="3-5-7">
    <Consumer frame={frame} now={now} revealRound={revealRound} />
  </ChipTransportProvider>); });
};
const balance = () => container.querySelector('[data-balance]')?.textContent;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  db.batches = []; db.requests = []; db.disclosed = false; db.batchInsert = null;
  db.players = [{ id: 'winner', chips: -3, position: 1, chip_transfer_cursor: 1 }];
  settled.mockClear();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });

describe('3-5-7 authorized frame recovers concealed settlement events', () => {
  it('recovers the missing normal-leg batch, retains closing balance and applies the next settlement once', async () => {
    const concealed = { round: 1, completed: false, cursor: 1, chips: -3 };
    await render(concealed, 1000);
    // Settlement persists, but neither its player UPDATE nor batch INSERT reaches this peer.
    db.batches = [leg(2, -3)];
    db.players = [{ id: 'winner', chips: -5, position: 1, chip_transfer_cursor: 2 }];
    await render(concealed, 3699);
    expect(balance()).toBe('-3'); expect(db.requests).toEqual([]);
    db.disclosed = true;
    const authorized = { round: 1, completed: true, cursor: 2, chips: -5 };
    await render(authorized, 3700);
    expect(balance()).toBe('-3'); expect(db.requests).toEqual([]);
    await render(authorized, 5300);
    expect(db.requests).toEqual([2]); expect(balance()).toBe('-5');
    expect(settled).toHaveBeenCalledTimes(1);
    await act(async () => { db.batchInsert?.({ new: db.batches[0] }); });
    await render(authorized, 6000);
    expect(balance()).toBe('-5'); expect(settled).toHaveBeenCalledTimes(1);

    db.disclosed = false;
    const successor = { round: 2, completed: false, cursor: 2, chips: -5 };
    await render(successor, 1000);
    db.batches.push(leg(3, -5));
    db.players = [{ id: 'winner', chips: -7, position: 1, chip_transfer_cursor: 3 }];
    await render(successor, 3699);
    expect(balance()).toBe('-5'); expect(db.requests).toEqual([2]);
    db.disclosed = true;
    const next = { round: 2, completed: true, cursor: 3, chips: -7 };
    await render(next, 3700);
    expect(balance()).toBe('-5'); expect(db.requests).toEqual([2]);
    await render(next, 5300);
    await act(async () => { for (const batch of db.batches) db.batchInsert?.({ new: batch }); });
    expect(db.requests).toEqual([2, 3]); expect(balance()).toBe('-7');
    expect(settled).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-deltas]')?.textContent).toBe('-2,-2');
  });

  it('does not recover an incomplete or mismatched round even when the local clock has elapsed', async () => {
    await render({ round: 1, completed: false, cursor: 1, chips: -3 }, 6000);
    db.batches = [leg(2, -3)]; db.disclosed = true;
    db.players = [{ id: 'winner', chips: -5, position: 1, chip_transfer_cursor: 2 }];
    await render({ round: 1, completed: false, cursor: 2, chips: -5 }, 6000);
    await render({ round: 1, completed: true, cursor: 2, chips: -5 }, 6000, 2);
    expect(db.requests).toEqual([]); expect(balance()).toBe('-3');
    await render({ round: 1, completed: true, cursor: 2, chips: -5 }, 6000);
    expect(db.requests).toEqual([2]); expect(balance()).toBe('-5');
  });

  it('baselines a post-DROP reconnect without replaying a settled leg', async () => {
    db.batches = [leg(2, -3)]; db.disclosed = true;
    db.players = [{ id: 'winner', chips: -5, position: 1, chip_transfer_cursor: 2 }];
    await render({ round: 1, completed: true, cursor: 2, chips: -5 }, 6000);
    await act(async () => { db.batchInsert?.({ new: db.batches[0] }); });
    expect(balance()).toBe('-5'); expect(db.requests).toEqual([]);
    expect(settled).not.toHaveBeenCalled();
    expect(container.querySelector('[data-deltas]')?.textContent).toBe('');
  });

  it('connects the retained revealed cursor to the existing recovery hook in the table', () => {
    const source = readFileSync(join(__dirname, '../../components/MobileGameTable.tsx'), 'utf8');
    expect(source).toMatch(/useChipPresentationCursorState\(\s*retainedThreeFiveSevenRevealedFinancialPresentation\?\.transferCursor \?\? null,?\s*\)/);
  });
});
