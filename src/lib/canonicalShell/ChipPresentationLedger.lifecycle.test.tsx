// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  batchInsert: null as ((payload: { new?: unknown }) => void) | null,
  playerUpdate: null as ((payload: { new?: unknown }) => void) | null,
  gameUpdate: null as ((payload: { new?: unknown }) => void) | null,
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
          if (config.table === 'games') realtime.gameUpdate = callback;
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
  realtime.gameUpdate = null;
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
  it('retains the exact dice award through peer next-game selection and ignores stale completion',async()=>{
    realtime.rows.games={pot:4,pot_transfer_cursor:0,current_game_uuid:'dealer',authority_revision:1};
    const flights: import('./ChipPresentationLedger').LedgerDispatchOptions[]=[];
    const transport={dispatch:vi.fn((_intent,options)=>{flights.push(options);return true;}),cancel:vi.fn()};
    const settled=vi.fn();let ledger:ReturnType<typeof useChipPresentationLedger>;let ready=false;
    const {diceTransferReady}=await import('@/lib/dice/transferAdmission');
    function Harness(){ledger=useChipPresentationLedger('game-1',transport,b=>diceTransferReady('horses|winseq|game-1|dealer|1|r1','dealer','r1',b.dealer_game_id,true,!ready,b.source_round_id),ready?1:0,settled,undefined,undefined,undefined,true,true);return null;}
    await act(async()=>{root.render(<Harness/>);});
    const award:ChipPresentationBatch={id:'award',game_id:'game-1',dealer_game_id:'dealer',source_round_id:'r1',cursor:1,reason:'win',opening_balances:{pot:4,'player:player-1':10},closing_balances:{pot:0,'player:player-1':14},transfers:[{id:'flight',amount:4,from:{kind:'pot'},to:{kind:'player',playerId:'player-1'}}]};
    await act(async()=>{realtime.batchInsert?.({new:award});});expect(ledger!.cursorState(1)).toBe('queued');
    realtime.rows.games={pot:0,pot_transfer_cursor:1,current_game_uuid:'next',authority_revision:2};
    await act(async()=>{realtime.gameUpdate?.({new:realtime.rows.games});});
    expect(ledger!.cursorState(1)).toBe('queued');expect(settled).not.toHaveBeenCalled();
    ready=true;await act(async()=>{root.render(<Harness/>);});expect(transport.dispatch).toHaveBeenCalledTimes(1);
    await act(async()=>{realtime.gameUpdate?.({new:{pot:0,pot_transfer_cursor:1,current_game_uuid:'third',authority_revision:3}});});
    expect(transport.cancel).not.toHaveBeenCalled();expect(ledger!.cursorState(1)).toBe('running');
    await act(async()=>{flights[0].onSettled?.();});expect(settled).toHaveBeenCalledTimes(1);
    await act(async()=>{flights[0].onSettled?.();});expect(settled).toHaveBeenCalledTimes(1);
  });
  it('releases a missed old payout before the new three-player ante, without replaying the payout', async () => {
    realtime.rows.players = ['a','b','winner'].map((id,i)=>({id,position:i+1,chips:id==='winner'?-7:6,chip_transfer_cursor:97}));
    realtime.rows.games = {pot:18,pot_transfer_cursor:97,current_game_uuid:'old',authority_revision:10};
    const flights: import('./ChipPresentationLedger').LedgerDispatchOptions[]=[];
    const transport={dispatch:vi.fn((_intent,options)=>{flights.push(options);return true;}),cancel:vi.fn()};
    const settled=vi.fn();let ledger:ReturnType<typeof useChipPresentationLedger>;
    function Harness(){ledger=useChipPresentationLedger('session',transport,b=>b.cursor!==98,0,settled,undefined,undefined,undefined,true);return null;}
    await act(async()=>{root.render(<Harness/>);});
    const payout:ChipPresentationBatch={id:'payout',game_id:'session',dealer_game_id:'old',cursor:98,reason:'ante',
      opening_balances:{pot:18,'player:winner':-7},closing_balances:{pot:0,'player:winner':19},
      transfers:[{id:'old-flight',amount:18,from:{kind:'pot'},to:{kind:'player',playerId:'winner'}}]};
    const ante:ChipPresentationBatch={id:'ante',game_id:'session',dealer_game_id:'new',cursor:99,reason:'ante',
      opening_balances:{pot:0,'player:a':6,'player:b':6,'player:winner':19},
      closing_balances:{pot:9,'player:a':3,'player:b':3,'player:winner':16},
      transfers:['a','b','winner'].map(id=>({id:'ante-'+id,amount:3,from:{kind:'player',playerId:id},to:{kind:'pot'}}))};
    await act(async()=>{realtime.batchInsert?.({new:payout});realtime.batchInsert?.({new:ante});});
    expect(transport.dispatch).not.toHaveBeenCalled();expect(ledger!.potBalance(-1)).toBe(18);
    realtime.rows.games={pot:9,pot_transfer_cursor:99,current_game_uuid:'new',authority_revision:11};
    realtime.rows.players=['a','b','winner'].map((id,i)=>({id,position:i+1,chips:id==='winner'?16:3,chip_transfer_cursor:99}));
    await act(async()=>{realtime.gameUpdate?.({new:realtime.rows.games});});
    expect(ledger!.cursorState(98)).toBe('reconciled');
    expect(transport.dispatch).toHaveBeenCalledTimes(3);
    expect(transport.dispatch.mock.calls.every(([intent])=>intent.from.kind==='seat')).toBe(true);
    await act(async()=>{for(const flight of flights){flight.onDeparted?.();flight.onArrived?.();flight.onSettled?.();}});
    expect(ledger!.potBalance(-1)).toBe(9);
    expect(ledger!.cursorState(99)).toBe('settled');
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'ante'}));
    await act(async()=>{realtime.batchInsert?.({new:payout});realtime.gameUpdate?.({new:{pot:18,pot_transfer_cursor:97,current_game_uuid:'old',authority_revision:10}});});
    expect(ledger!.potBalance(-1)).toBe(9);expect(transport.dispatch).toHaveBeenCalledTimes(3);
  });
  it('never replays a committed Run21 dollar on duplicate delivery or a reconnect baseline', async () => {
    realtime.rows.players=[{id:'loser',chips:0,position:1,chip_transfer_cursor:0},{id:'winner',chips:0,position:2,chip_transfer_cursor:0}];
    let callbacks: import('./ChipPresentationLedger').LedgerDispatchOptions|undefined;
    const transport={dispatch:vi.fn((_intent,options)=>{callbacks=options;return true;}),cancel:vi.fn()};
    let ledger:ReturnType<typeof useChipPresentationLedger>;
    function Harness(){ledger=useChipPresentationLedger('run21-session',transport,()=>true,0,undefined,undefined,undefined,undefined,true);return null;}
    await act(async()=>{root.render(<Harness/>);});
    const batch:ChipPresentationBatch={id:'receipt-batch',game_id:'run21-session',dealer_game_id:'run21-dealer',cursor:1,reason:'transfer',
      transfers:[{id:'run21-session:1:1',amount:1,from:{kind:'player',playerId:'loser'},to:{kind:'player',playerId:'winner'}}],
      opening_balances:{'player:loser':0,'player:winner':0},closing_balances:{'player:loser':-1,'player:winner':1}};
    await act(async()=>{realtime.batchInsert?.({new:batch});realtime.batchInsert?.({new:batch});root.render(<Harness/>);});
    expect(transport.dispatch).toHaveBeenCalledTimes(1);
    expect(transport.dispatch).toHaveBeenCalledWith(expect.objectContaining({id:'run21-session:1:1',amount:1,variant:'canonicalWinTransfer',destinationReaction:{pulse:true}}),expect.any(Object));
    realtime.rows.players=[{id:'loser',chips:-1,position:1,chip_transfer_cursor:1},{id:'winner',chips:1,position:2,chip_transfer_cursor:1}];
    await act(async()=>{callbacks?.onDeparted?.();callbacks?.onArrived?.();callbacks?.onSettled?.();});
    await act(async()=>{root.render(<></>);});
    realtime.rows.gameplay_transfer_batches=[batch];
    await act(async()=>{root.render(<Harness/>);});
    expect(ledger!.cursorState(1)).toBe('reconciled');
    await act(async()=>{realtime.batchInsert?.({new:batch});});
    expect(transport.dispatch).toHaveBeenCalledTimes(1);
    expect(ledger!.playerBalance('loser',99)).toBe(-1);expect(ledger!.playerBalance('winner',99)).toBe(1);
  });
  it('preserves dealer-game identity and completes only after every real flight settles, once', async () => {
    realtime.rows.players = ['a', 'b', 'winner'].map((id, index) => ({ id, chips: 10, position: index + 1, chip_transfer_cursor: 0 }));
    const settled = vi.fn();
    const flights: Array<() => void> = [];
    const transport: ChipPresentationLedgerTransport = {
      dispatch: (_intent, callbacks) => { flights.push(() => callbacks?.onSettled?.()); return true; },
      cancel: vi.fn(),
    };
    function Harness() {
      useChipPresentationLedger('game-1', transport, () => true, 0, settled, () => {}, () => {}, () => {}, true);
      return null;
    }
    await act(async () => { root.render(<Harness />); });
    const batch: ChipPresentationBatch = { id: 'payout', game_id: 'game-1', dealer_game_id: 'exact-dg', cursor: 1,
      reason: 'transfer', opening_balances: { 'player:a': 10, 'player:b': 10, 'player:winner': 10 },
      closing_balances: { 'player:a': 0, 'player:b': 0, 'player:winner': 30 }, transfers: ['a', 'b'].map(id => ({
        id, amount: 10, from: { kind: 'player' as const, playerId: id }, to: { kind: 'player' as const, playerId: 'winner' },
      })) };
    await act(async () => { realtime.batchInsert?.({ new: batch }); });
    expect(flights).toHaveLength(2);
    expect(settled).not.toHaveBeenCalled();
    await act(async () => { flights[0](); });
    expect(settled).not.toHaveBeenCalled();
    await act(async () => { flights[1](); });
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'payout', dealer_game_id: 'exact-dg' }));
    await act(async () => { flights[1](); realtime.batchInsert?.({ new: batch }); });
    expect(settled).toHaveBeenCalledTimes(1);
  });

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

it('preserves a live initial ante flight, deduplicates it and does not replay its hydration baseline',async()=>{
 const {useDiceRolloverBarrier}=await import('@/hooks/useDiceRolloverBarrier');
 const dispatch=vi.fn((_intent,callbacks)=>{callbacks?.onDeparted?.();callbacks?.onArrived?.();callbacks?.onSettled?.();return true;});
 const transport={dispatch,cancel:vi.fn()};
 function Harness(){const barrier=useDiceRolloverBarrier({dealer:'dealer',round:'r1',key:null,pending:false,show:false,complete:()=>{},resultObserved:false});useChipPresentationLedger('game-1',transport,barrier.admit);return null;}
 await act(async()=>{root.render(<Harness/>);});
 const batch:ChipPresentationBatch={id:'initial',game_id:'game-1',dealer_game_id:'dealer',source_round_id:null,successor_round_id:'r1',cursor:1,reason:'ante',opening_balances:{'player:player-1':10,pot:0},closing_balances:{'player:player-1':9,pot:1},transfers:[{id:'initial-flight',amount:1,from:{kind:'player',playerId:'player-1'},to:{kind:'pot'}}]};
 realtime.rows.players=[{id:'player-1',chips:9,position:1,chip_transfer_cursor:1}];realtime.rows.games={pot:1,pot_transfer_cursor:1};
 await act(async()=>{realtime.batchInsert?.({new:batch});});expect(dispatch).toHaveBeenCalledTimes(1);
 await act(async()=>{realtime.batchInsert?.({new:batch});});expect(dispatch).toHaveBeenCalledTimes(1);
 await act(async()=>{root.render(null);});await act(async()=>{root.render(<Harness/>);});
 await act(async()=>{realtime.batchInsert?.({new:batch});});expect(dispatch).toHaveBeenCalledTimes(1);
});

it('reconciles legacy and prior-round payouts without firing or consuming current NQ completion', async () => {
 const transport={dispatch:vi.fn(()=>true),cancel:vi.fn()}; const settled=vi.fn();
 let pending=true;let ledger:ReturnType<typeof useChipPresentationLedger>;
 const {diceTransferReady}=await import('@/lib/dice/transferAdmission');
 function Harness(){ledger=useChipPresentationLedger('game-1',transport,b=>diceTransferReady('ship-captain-crew|winseq|game-1|dealer|2|r2','dealer','r2',b.dealer_game_id,true,pending,b.source_round_id),pending?0:1,settled,undefined,undefined,undefined,true);return null;}
 await act(async()=>{root.render(<Harness/>);});
 const batch=(cursor:number,round?:string):ChipPresentationBatch=>({id:`b${cursor}`,game_id:'game-1',dealer_game_id:'dealer',source_round_id:round,cursor,reason:'win',opening_balances:{pot:2,'player:player-1':10},closing_balances:{pot:0,'player:player-1':12},transfers:[{id:`t${cursor}`,amount:2,from:{kind:'pot'},to:{kind:'player',playerId:'player-1'}}]});
 await act(async()=>{realtime.batchInsert?.({new:batch(1)});realtime.batchInsert?.({new:batch(2,'r1')});realtime.batchInsert?.({new:batch(3,'r2')});});
 expect(ledger!.cursorState(1)).toBe('reconciled');expect(ledger!.cursorState(2)).toBe('reconciled');expect(ledger!.cursorState(3)).toBe('queued');
 expect(transport.dispatch).not.toHaveBeenCalled();expect(settled).not.toHaveBeenCalled();
 pending=false;await act(async()=>{root.render(<Harness/>);});
 expect(transport.dispatch).toHaveBeenCalledTimes(1);
 await act(async()=>{realtime.batchInsert?.({new:batch(1)});realtime.batchInsert?.({new:batch(2,'r1')});realtime.batchInsert?.({new:batch(3,'r2')});});
 expect(transport.dispatch).toHaveBeenCalledTimes(1);
});

it('launches the exact SCC award only after the real No Qualify overlay dismisses',async()=>{
 vi.useFakeTimers();
 try{
 const {useNoQualifyPresentation}=await import('@/hooks/useNoQualifyPresentation');
 const {NoQualifyAnimation}=await import('@/components/NoQualifyAnimation');
 const {diceTransferReady}=await import('@/lib/dice/transferAdmission');
 const transport={dispatch:vi.fn(()=>true),cancel:vi.fn()};
 function Harness({complete}:{complete:boolean}){
  const receipt=useNoQualifyPresentation('dealer:r1:player-1',{isComplete:complete,rollKey:complete?2:1,result:complete?{isQualified:false}:undefined},true);
  useChipPresentationLedger('game-1',transport,b=>diceTransferReady('ship-captain-crew|winseq|game-1|dealer|1|r1','dealer','r1',b.dealer_game_id,true,receipt.pending,b.source_round_id),receipt.pending?0:1);
  return receipt.show?<NoQualifyAnimation show onComplete={receipt.complete}/>:null;
 }
 await act(async()=>{root.render(<Harness complete={false}/>);});
 const award:ChipPresentationBatch={id:'exact-award',game_id:'game-1',dealer_game_id:'dealer',source_round_id:'r1',cursor:1,reason:'win',opening_balances:{pot:2,'player:player-1':10},closing_balances:{pot:0,'player:player-1':12},transfers:[{id:'award-flight',amount:2,from:{kind:'pot'},to:{kind:'player',playerId:'player-1'}}]};
 await act(async()=>{root.render(<Harness complete/>);});
 await act(async()=>{realtime.batchInsert?.({new:award});});
 expect(transport.dispatch).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(1000));expect(document.querySelector('[data-no-qualify-overlay]')).not.toBeNull();expect(transport.dispatch).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(2000));expect(document.querySelector('[data-no-qualify-overlay]')).toBeNull();expect(transport.dispatch).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});

it('queues an early successor ante through outgoing NQ dismissal across an all-NQ rollover',async()=>{
 vi.useFakeTimers();try{
 const {useNoQualifyPresentation}=await import('@/hooks/useNoQualifyPresentation');const {useDiceRolloverBarrier}=await import('@/hooks/useDiceRolloverBarrier');const {NoQualifyAnimation}=await import('@/components/NoQualifyAnimation');
 const transport={dispatch:vi.fn(()=>true),cancel:vi.fn()};
 function Harness({round,complete}:{round:string;complete:boolean}){
  const receipt=useNoQualifyPresentation(`d:${round}:player-1`,{isComplete:complete,rollKey:complete?2:1,result:complete?{isQualified:false}:undefined},true);
  const barrier=useDiceRolloverBarrier({dealer:'d',round,key:receipt.key,pending:receipt.pending,show:receipt.show,complete:receipt.complete,resultObserved:complete});
  useChipPresentationLedger('game-1',transport,barrier.admit,(round==='r2'?2:1)+(barrier.show?0:100));
  return <NoQualifyAnimation key={barrier.key} show={barrier.show} onComplete={barrier.complete}/>;
 }
 await act(async()=>{root.render(<Harness round="r1" complete={false}/>);});
 const ante:ChipPresentationBatch={id:'successor-ante',game_id:'game-1',dealer_game_id:'d',source_round_id:'r1',successor_round_id:'r2',cursor:1,reason:'ante',opening_balances:{pot:4,'player:player-1':10},closing_balances:{pot:6,'player:player-1':8},transfers:[{id:'ante-flight',amount:2,from:{kind:'player',playerId:'player-1'},to:{kind:'pot'}}]};
 await act(async()=>{realtime.batchInsert?.({new:ante});});expect(transport.dispatch).not.toHaveBeenCalled();
 await act(async()=>{root.render(<Harness round="r1" complete/>);});await act(()=>vi.advanceTimersByTimeAsync(1000));
 const overlay=document.querySelector('[data-no-qualify-overlay]');expect(overlay).not.toBeNull();
 await act(async()=>{root.render(<Harness round="r2" complete={false}/>);});expect(document.querySelector('[data-no-qualify-overlay]')).toBe(overlay);expect(transport.dispatch).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(1999));expect(transport.dispatch).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(1));expect(document.querySelector('[data-no-qualify-overlay]')).toBeNull();expect(transport.dispatch).toHaveBeenCalledTimes(1);
 await act(async()=>{realtime.batchInsert?.({new:ante});});expect(transport.dispatch).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});
