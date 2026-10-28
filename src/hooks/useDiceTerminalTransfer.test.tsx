// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({rows:[] as any[],state:'queued',ensure:vi.fn(),read:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,then:(resolve:any)=>fixture.read().then(resolve)};return q;}}}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({useChipTransportInternal:()=>({gameId:'session',__ensurePresentationCursor:fixture.ensure,__presentationCursorState:()=>fixture.state})}));
import {useDiceTerminalTransfer} from './useDiceTerminalTransfer';
const batch=(round='round')=>({game_id:'session',dealer_game_id:'dealer',source_round_id:round,cursor:7,transfers:[{from:{kind:'pot'},to:{kind:'player'},amount:4}]});
const args=(round='round')=>({gameId:'session',dealerGameId:'dealer',roundId:round,trigger:`horses|winseq|session|dealer|1|${round}`,amount:4,ready:true});
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it.each(['settled','reconciled'])('waits for canonical %s receipt, never the legacy elapsed duration',async terminal=>{
 vi.useFakeTimers();fixture.state='queued';fixture.read.mockResolvedValue({data:[batch()]});const done=vi.fn();
 const h=renderHook(()=>useDiceTerminalTransfer({...args(),onComplete:done}));await act(async()=>{});
 await act(()=>vi.advanceTimersByTimeAsync(10000));expect(done).not.toHaveBeenCalled();
 fixture.state='running';h.rerender();expect(done).not.toHaveBeenCalled();
 fixture.state=terminal;h.rerender();expect(done).toHaveBeenCalledTimes(1);h.rerender();expect(done).toHaveBeenCalledTimes(1);
});
it('rejects stale async lookup and wrong-round batch across Run It Back',async()=>{
 let resolve:any;fixture.state='settled';fixture.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({data:[batch('next')]});const done=vi.fn();
 const h=renderHook(({round,ready})=>useDiceTerminalTransfer({...args(round),ready,onComplete:done}),{initialProps:{round:'round',ready:true}});
 await act(async()=>{});
 h.rerender({round:'next',ready:false});await act(async()=>{resolve({data:[batch()]});});expect(done).not.toHaveBeenCalled();
 h.rerender({round:'next',ready:true});expect(done).toHaveBeenCalledTimes(1);
});
it('retries missing authority but never consumes another round receipt',async()=>{
 vi.useFakeTimers();fixture.state='settled';fixture.read.mockResolvedValueOnce({data:[batch('old')]}).mockResolvedValue({data:[batch()]});const done=vi.fn();
 renderHook(()=>useDiceTerminalTransfer({...args(),onComplete:done}));await act(async()=>{});expect(done).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(1000));expect(done).toHaveBeenCalledTimes(1);
});
it('allows pre-metadata history only after reconciliation, never a borrowed live receipt',async()=>{
 fixture.state='settled';fixture.read.mockResolvedValue({data:[{...batch(),source_round_id:null}]});const done=vi.fn();
 const h=renderHook(()=>useDiceTerminalTransfer({...args(),onComplete:done}));await act(async()=>{});
 expect(done).not.toHaveBeenCalled();fixture.state='reconciled';h.rerender();expect(done).toHaveBeenCalledTimes(1);
});
