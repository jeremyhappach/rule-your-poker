// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  batchInsert: null as ((payload: { new?: unknown }) => void) | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const rowsByTable: Record<string, unknown> = {
    gameplay_transfer_batches: [],
    players: [{ id: 'player-1', chips: 10, position: 1, chip_transfer_cursor: 0 }],
    games: { pot: 0, pot_transfer_cursor: 0 },
  };
  const supabase = {
    from(table: string) {
      const result = { data: rowsByTable[table] ?? null };
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = () => Promise.resolve(result);
      builder.then = (
        resolve: (value: typeof result) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
    channel() {
      const channel = {
        on(
          _event: string,
          config: { table?: string },
          callback: (payload: { new?: unknown }) => void,
        ) {
          if (config.table === 'gameplay_transfer_batches') realtime.batchInsert = callback;
          return channel;
        },
        subscribe(callback: (status: string) => void) {
          callback('SUBSCRIBED');
          return channel;
        },
      };
      return channel;
    },
    removeChannel: vi.fn(),
  };
  return { supabase };
});

import {
  useChipPresentationLedger,
  type ChipPresentationBatch,
  type ChipPresentationLedgerTransport,
} from './ChipPresentationLedger';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  realtime.batchInsert = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('ChipPresentationLedger lifecycle callbacks', () => {
  it('fires batch start exactly once before dispatch even when settlement is synchronous', async () => {
    const order: string[] = [];
    const started = vi.fn(() => { order.push('started'); });
    const settled = vi.fn(() => { order.push('settled'); });
    const transport: ChipPresentationLedgerTransport = {
      dispatch: (_intent, callbacks) => {
        order.push('dispatch');
        callbacks?.onDeparted?.();
        callbacks?.onArrived?.();
        callbacks?.onSettled?.();
        return true;
      },
      cancel: vi.fn(),
    };

    function Harness() {
      useChipPresentationLedger(
        'game-1',
        transport,
        () => true,
        0,
        settled,
        started,
        () => {},
        () => {},
        true,
      );
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(realtime.batchInsert).not.toBeNull();

    const batch: ChipPresentationBatch = {
      id: 'batch-1',
      game_id: 'game-1',
      cursor: 1,
      reason: 'ante',
      transfers: [{
        id: 'transfer-1',
        amount: 1,
        from: { kind: 'player', playerId: 'player-1' },
        to: { kind: 'pot' },
      }],
      opening_balances: { 'player:player-1': 10, pot: 0 },
      closing_balances: { 'player:player-1': 9, pot: 1 },
    };
    await act(async () => {
      realtime.batchInsert?.({ new: batch });
      await Promise.resolve();
    });

    expect(started).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['started', 'dispatch', 'settled']);
  });
});
