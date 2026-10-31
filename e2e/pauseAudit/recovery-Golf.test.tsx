import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
import {useGolf} from '@/hooks/useGolf';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
const record=(scenario:string,extra:any)=>appendFileSync('e2e/pauseAudit/evidence/recovery-observations.jsonl',JSON.stringify({game:'Golf',source:'candidate-uncommitted',layer:'actual hook and snapshot acceptance; controlled transport; no shell/auth/database',scenario,...extra})+'\n');
function setup(role='actor'){
 let value:any={id:'dealer',identity:{sessionId:'session',dealerGameId:'dealer',roundId:'round'},scope:'dealer:1',revision:1,serverAt:1000,paused:true,pausedAt:1000,finished:false,settled:false,canAct:role==='actor',viewerId:role==='actor'?'p1':'p2',deadline:100000,phase:'playing',rules:{version:'ptown-words/2'},players:[{id:'p1'},{id:'p2'}],board:{phase:'playing',deadline:100000,rules:{version:'audit'},result:null}};
 if('Golf'==='Battle31')value.board.rules.version='battle-31/1';
 if('Golf'==='PtownWords'){value.board=Array(225).fill(null);value.rack=[];}
 let status!:(v:boolean)=>void;const off=vi.fn();const transport={load:vi.fn(async()=>value),send:vi.fn(async()=>value),subscribe:vi.fn((_refresh:any,s:any)=>{status=s;return off;})};
 return {transport,off,status:(v:boolean)=>status(v),resume:()=>{value={...value,paused:false,pausedAt:null,revision:2,serverAt:31000,board:Array.isArray(value.board)?value.board:{...value.board,deadline:130000},deadline:130000};}};
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','Date','performance']});Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('CONTRACT dropped resume is repaired for two independent hooks by shared session recovery',async()=>{
 const a=setup(),b=setup('observer'),actor=renderHook(()=>useGolf('dealer','actor',a.transport as any)),observer=renderHook(()=>useGolf('dealer','observer',b.transport as any));
 await act(async()=>{});await act(async()=>{a.status(true);b.status(true);});expect(actor.result.current.snapshot?.paused).toBe(true);expect(observer.result.current.snapshot?.paused).toBe(true);
 a.resume();b.resume();const loads=[a.transport.load.mock.calls.length,b.transport.load.mock.calls.length];
 await act(()=>vi.advanceTimersByTimeAsync(30000));const quiet=[actor.result.current.snapshot?.paused,observer.result.current.snapshot?.paused];
 await act(async()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));
 record('dropped-resume-plus-session-recovery',{roles:['actor','observer'],quietWindowMs:30000,quietPaused:quiet,pausedAfterSharedRecovery:[actor.result.current.snapshot?.paused,observer.result.current.snapshot?.paused],loadCountsBefore:loads,loadCountsAfter:[a.transport.load.mock.calls.length,b.transport.load.mock.calls.length],commands:a.transport.send.mock.calls.length+b.transport.send.mock.calls.length});
 expect(actor.result.current.snapshot?.paused).toBe(false);expect(observer.result.current.snapshot?.paused).toBe(false);
});
it('focus control loads resumed authority without sending any gameplay command',async()=>{
 const f=setup(),hook=renderHook(()=>useGolf('dealer','actor',f.transport as any));await act(async()=>{});await act(async()=>f.status(true));f.resume();
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current.snapshot?.paused).toBe(false);expect(hook.result.current.snapshot?.revision).toBe(2);expect(f.transport.send).not.toHaveBeenCalled();record('focus-positive-control',{revision:2,paused:false,commands:0});
});
it('CONTRACT failed subscription is rebuilt after successful focus snapshot',async()=>{
 const f=setup(),hook=renderHook(()=>useGolf('dealer','actor',f.transport as any));await act(async()=>{});await act(async()=>f.status(true));await act(async()=>f.status(false));f.resume();
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current.snapshot?.paused).toBe(false);
 record('subscription-recovery',{subscribes:f.transport.subscribe.mock.calls.length,revision:hook.result.current.snapshot?.revision,connected:(hook.result.current as any).connected??null,error:hook.result.current.error,commands:f.transport.send.mock.calls.length});
 expect(f.transport.subscribe).toHaveBeenCalledTimes(2);
});
