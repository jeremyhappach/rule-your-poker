import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
import {useQuintzee} from '@/hooks/useQuintzee';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
function setup(){
 let value:any={id:'dealer',revision:1,scope:'dealer:1',serverAt:1000,theme:'classic',pausedAt:1000,outcome:'loaded',status:'active',state:{finished:false,players:['a','b'],round:1,turnIndex:0,scores:{a:0,b:0},qualified:[],results:[],board:{phase:'playing',deadline:100000,dice:[1,2,3,4,5],held:[],rollsRemaining:2,scores:{},potentials:{},scoreBefore:0,score:0,result:null}}};
 const transport={load:vi.fn(async()=>value),send:vi.fn(async()=>value),subscribe:vi.fn(()=>vi.fn())};
 return {transport,resume:()=>{value={...value,revision:2,pausedAt:null,serverAt:31000,state:{...value.state,board:{...value.state.board,deadline:130000}}};}};
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();});
it('CONTRACT Quintzee dropped resume recovers through shared session recovery for both hook contexts',async()=>{
 const a=setup(),b=setup(),actor=renderHook(()=>useQuintzee('dealer','a',a.transport)),observer=renderHook(()=>useQuintzee('dealer','b',b.transport));await act(async()=>{});
 expect(actor.result.current.snapshot?.pausedAt).toBe(1000);expect(observer.result.current.snapshot?.pausedAt).toBe(1000);a.resume();b.resume();
 await act(()=>vi.advanceTimersByTimeAsync(30000));await act(async()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));
 appendFileSync('e2e/pauseAudit/evidence/phase2-observations.jsonl',JSON.stringify({game:'quintzee',scenario:'dropped-resume-session-recovery',pausedAt:[actor.result.current.snapshot?.pausedAt,observer.result.current.snapshot?.pausedAt],loads:[a.transport.load.mock.calls.length,b.transport.load.mock.calls.length],commands:a.transport.send.mock.calls.length+b.transport.send.mock.calls.length})+'\n');
 expect(actor.result.current.snapshot?.pausedAt).toBeNull();expect(observer.result.current.snapshot?.pausedAt).toBeNull();
});
it('CONTROL Quintzee focus fetches resumed revision without a command',async()=>{
 const f=setup(),h=renderHook(()=>useQuintzee('dealer','a',f.transport));await act(async()=>{});f.resume();await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(h.result.current.snapshot?.pausedAt).toBeNull();expect(h.result.current.snapshot?.revision).toBe(2);expect(f.transport.send).not.toHaveBeenCalled();
});
