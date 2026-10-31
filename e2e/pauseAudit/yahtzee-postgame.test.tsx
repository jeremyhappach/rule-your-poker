import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:f.rpc}}));
import {useYahtzeePostgameRecovery} from '@/hooks/useYahtzeePostgameRecovery';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
const scope={gameId:'session',dealerGameId:'dealer',roundId:'round',handNumber:1};
const success={data:{outcome:'advanced',status:'game_selection'},error:null};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();f.rpc.mockResolvedValue(success);vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('retains the exact completion request when resume precedes a delayed rejection',async()=>{
 let finish!:(v:any)=>void;f.rpc.mockImplementationOnce(()=>new Promise(r=>finish=r));const refresh=vi.fn();
 const h=renderHook(({paused})=>useYahtzeePostgameRecovery('session',paused,refresh),{initialProps:{paused:false}});
 await act(async()=>h.result.current(scope));expect(f.rpc).toHaveBeenCalledTimes(1);
 h.rerender({paused:true});h.rerender({paused:false});await act(async()=>finish({data:null,error:{message:'paused'}}));
 await act(()=>vi.advanceTimersByTimeAsync(1100));expect(f.rpc).toHaveBeenCalledTimes(2);expect(f.rpc.mock.calls[1]).toEqual(f.rpc.mock.calls[0]);
 await act(async()=>dispatchAuthoritativeRecoverySnapshot('online'));await act(()=>vi.advanceTimersByTimeAsync(5000));expect(f.rpc).toHaveBeenCalledTimes(2);
});
it('holds a completed presentation request while paused and submits it once after resume',async()=>{
 const h=renderHook(({paused})=>useYahtzeePostgameRecovery('session',paused,vi.fn()),{initialProps:{paused:true}});
 await act(async()=>{h.result.current(scope);h.result.current(scope);});await act(()=>vi.advanceTimersByTimeAsync(5000));expect(f.rpc).not.toHaveBeenCalled();
 await act(async()=>h.rerender({paused:false}));expect(f.rpc).toHaveBeenCalledTimes(1);
});
it('ignores an old session response and cannot retry it in a new session',async()=>{
 let finish!:(v:any)=>void;f.rpc.mockImplementationOnce(()=>new Promise(r=>finish=r));const refresh=vi.fn();
 const h=renderHook(({session})=>useYahtzeePostgameRecovery(session,false,refresh),{initialProps:{session:'session'}});
 await act(async()=>h.result.current(scope));h.rerender({session:'other'});await act(async()=>finish({data:null,error:{message:'late'}}));await act(()=>vi.advanceTimersByTimeAsync(5000));
 expect(f.rpc).toHaveBeenCalledTimes(1);expect(refresh).not.toHaveBeenCalled();
});
it('retired round callbacks cannot consume the successor completion request',async()=>{
 let finish!:(v:any)=>void;f.rpc.mockImplementationOnce(()=>new Promise(r=>finish=r));const refresh=vi.fn();const h=renderHook(()=>useYahtzeePostgameRecovery('session',false,refresh));
 await act(async()=>h.result.current(scope));await act(async()=>h.result.current({...scope,roundId:'next',handNumber:2}));await act(async()=>finish(success));await act(()=>vi.advanceTimersByTimeAsync(5000));
 expect(f.rpc).toHaveBeenCalledTimes(2);expect(f.rpc.mock.calls[1][1]._round_id).toBe('next');expect(refresh).toHaveBeenCalledTimes(1);
});
