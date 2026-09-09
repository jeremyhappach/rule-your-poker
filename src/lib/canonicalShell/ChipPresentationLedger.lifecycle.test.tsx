// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  batchInsert: null as ((payload: { new?: unknown }) => void) | null,
  playerUpdate: null as ((payload: { new?: unknown }) => void) | null,
  rows: {} as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    from(table: string) {
      const result = { data: realtime.rows[table] ?? null };
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
          if (config.table === 'players') realtime.playerUpdate = callback;
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
import {
  buildThreeFiveSevenRevealedFinancialPresentation,
  getThreeFiveSevenLegChargeAdmission,
} from '@/lib/threeFiveSeven/financialPresentation';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  realtime.batchInsert = null;
  realtime.playerUpdate = null;
  realtime.rows = {
    gameplay_transfer_batches: [],
    players: [{ id: 'player-1', chips: 10, position: 1, chip_transfer_cursor: 0 }],
    games: { pot: 0, pot_transfer_cursor: 0 },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ChipPresentationLedger lifecycle callbacks', () => {
  it.each(['batch-first', 'frame-first'] as const)(
    'holds a zero-flight leg balance and helper through full DROP/hold (%s)', async (order) => {
      const delta = vi.fn();
      const started = vi.fn();
      const settled = vi.fn();
      const transport: ChipPresentationLedgerTransport = {
        dispatch: vi.fn(() => true), cancel: vi.fn(),
      };
      const clock = {
        serverOffsetMs: 0,
        window: {
          id: 'reveal-1', gameId: 'game-1', dealerGameId: 'dealer-1',
          roundId: 'round-1', handNumber: 1, roundNumber: 2,
          startedAtMs: 0, countdownAtMs: 1000, dropAtMs: 3700,
          endsAtMs: 5300, continuationAtMs: 9300,
        },
      };
      function Harness({ hasFrame, nowMs }: { hasFrame: boolean; nowMs: number }) {
        const revealed = buildThreeFiveSevenRevealedFinancialPresentation({
          ...clock.window, transferCursor: hasFrame ? 1 : 0,
          roundCompleted: hasFrame, revealClock: hasFrame ? clock : null,
          revealBlocked: hasFrame && nowMs < 5300, nowMs,
        });
        const ledger = useChipPresentationLedger(
          'game-1', transport,
          (batch) => getThreeFiveSevenLegChargeAdmission(batch, revealed) ?? true,
          nowMs, settled, started, delta, () => {}, true,
        );
        return <output>{ledger.playerBalance('player-1', -999)}</output>;
      }
      const render = async (hasFrame: boolean, nowMs: number) => {
        await act(async () => { root.render(<Harness hasFrame={hasFrame} nowMs={nowMs} />); });
      };
      await render(order === 'frame-first', 1000);
      const leg: ChipPresentationBatch = {
        id: 'leg-1', game_id: 'game-1', cursor: 1, reason: 'leg', transfers: [],
        opening_balances: { 'player:player-1': 10 },
        closing_balances: { 'player:player-1': 8 },
      };
      const closingPlayer = { id: 'player-1', chips: 8, position: 1, chip_transfer_cursor: 1 };
      realtime.rows.players = [closingPlayer];
      await act(async () => {
        realtime.batchInsert?.({ new: leg });
        realtime.playerUpdate?.({ new: closingPlayer });
      });
      expect(container.textContent).toBe('10');
      expect(delta).not.toHaveBeenCalled();
      expect(started).not.toHaveBeenCalled();

      for (const time of [1900, 2800, 3700, 4700, 5299]) {
        await render(true, time);
        expect(container.textContent).toBe('10');
        expect(delta).not.toHaveBeenCalled();
      }
      await render(true, 5300);
      expect(container.textContent).toBe('8');
      expect(delta).toHaveBeenCalledTimes(1);
      expect(delta).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'leg-1', amount: -2, boundary: 'settled', reason: 'leg',
      }));
      expect(started).toHaveBeenCalledTimes(1);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(transport.dispatch).not.toHaveBeenCalled();
      await act(async () => { realtime.batchInsert?.({ new: leg }); });
      await render(true, 6000);
      expect(container.textContent).toBe('8');
      expect(delta).toHaveBeenCalledTimes(1);
    },
  );

  it('reconciles a cold-entry historical leg without replaying its helper', async () => {
    const leg: ChipPresentationBatch = {
      id: 'historical-leg', game_id: 'game-1', cursor: 1, reason: 'leg', transfers: [],
      opening_balances: { 'player:player-1': 10 },
      closing_balances: { 'player:player-1': 8 },
    };
    realtime.rows.gameplay_transfer_batches = [leg];
    realtime.rows.players = [{ id: 'player-1', chips: 8, position: 1, chip_transfer_cursor: 1 }];
    const delta = vi.fn();
    const transport = { dispatch: vi.fn(() => true), cancel: vi.fn() };
    function Harness() {
      const ledger = useChipPresentationLedger(
        'game-1', transport,
        (batch) => getThreeFiveSevenLegChargeAdmission(batch, null) ?? true,
        0, () => {}, () => {}, delta, () => {}, true,
      );
      return <output>{ledger.playerBalance('player-1', -999)}</output>;
    }
    await act(async () => { root.render(<Harness />); });
    await act(async () => { realtime.batchInsert?.({ new: leg }); });
    expect(container.textContent).toBe('8');
    expect(delta).not.toHaveBeenCalled();
    expect(transport.dispatch).not.toHaveBeenCalled();
  });

  it('releases the final leg before the separately admitted sweep credit and pot flight', async () => {
    realtime.rows.games = { pot: 22, pot_transfer_cursor: 0 };
    const delta = vi.fn();
    const started: string[] = [];
    const transport: ChipPresentationLedgerTransport = {
      dispatch: (_intent, callbacks) => {
        callbacks?.onDeparted?.();
        callbacks?.onArrived?.();
        callbacks?.onSettled?.();
        return true;
      },
      cancel: vi.fn(),
    };
    function Harness({ stage }: { stage: number }) {
      const revealed = stage > 0 ? {
        gameId: 'game-1', dealerGameId: 'dealer-1', roundId: 'terminal-round',
        handNumber: 4, roundNumber: 1, revealId: 'terminal-reveal', transferCursor: 3,
      } : null;
      const ledger = useChipPresentationLedger(
        'game-1', transport,
        (batch) => getThreeFiveSevenLegChargeAdmission(batch, revealed)
          ?? (batch.reason === 'sweep' ? stage === 2 : stage === 3),
        stage, () => {}, (batch) => { started.push(batch.reason); }, delta, () => {}, true,
      );
      return <output>{ledger.playerBalance('player-1', -999)}:{ledger.potBalance(-999)}</output>;
    }
    const render = async (stage: number) => {
      await act(async () => { root.render(<Harness stage={stage} />); });
    };
    await render(0);
    realtime.rows.players = [{ id: 'player-1', chips: 40, position: 1, chip_transfer_cursor: 3 }];
    realtime.rows.games = { pot: 0, pot_transfer_cursor: 3 };
    const common = { game_id: 'game-1', transfers: [] };
    const batches: ChipPresentationBatch[] = [
      { ...common, id: 'final-leg', cursor: 1, reason: 'leg',
        opening_balances: { 'player:player-1': 10 }, closing_balances: { 'player:player-1': 8 } },
      { ...common, id: 'sweep-credit', cursor: 2, reason: 'sweep',
        opening_balances: { 'player:player-1': 8 }, closing_balances: { 'player:player-1': 18 } },
      { ...common, id: 'pot-award', cursor: 3, reason: 'win',
        transfers: [{ id: 'pot-flight', amount: 22, from: { kind: 'pot' },
          to: { kind: 'player', playerId: 'player-1' } }],
        opening_balances: { 'player:player-1': 18, pot: 22 },
        closing_balances: { 'player:player-1': 40, pot: 0 } },
    ];
    await act(async () => { for (const batch of batches) realtime.batchInsert?.({ new: batch }); });
    expect(container.textContent).toBe('10:22');
    expect(delta).not.toHaveBeenCalled();
    await render(1);
    expect(container.textContent).toBe('8:22');
    expect(started).toEqual(['leg']);
    expect(delta.mock.calls.map(([event]) => event.amount)).toEqual([-2]);
    await render(2);
    expect(container.textContent).toBe('18:22');
    expect(started).toEqual(['leg', 'sweep']);
    await render(3);
    expect(container.textContent).toBe('40:0');
    expect(started).toEqual(['leg', 'sweep', 'win']);
    expect(delta.mock.calls.filter(([event]) => event.reason === 'leg')).toHaveLength(1);
  });

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
