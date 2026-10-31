import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
import {create,project} from '@/lib/triTowers/referenceEngine';
const mock=vi.hoisted(()=>({rpc:vi.fn(),submit:vi.fn(),channels:[] as any[]}));
vi.mock('@/lib/triTowers/client',async original=>({...await original<typeof import('@/lib/triTowers/client')>(),triTowersRpc:mock.rpc,submit:mock.submit}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{
 const record={notify:()=>{},status:(_s:string)=>{}};mock.channels.push(record);
 const c={on:(_e:any,_f:any,notify:()=>void)=>{record.notify=notify;return c;},subscribe:(status:(s:string)=>void)=>{record.status=status;status('SUBSCRIBED');return c;}};return c;
},removeChannel:vi.fn()}}));
import {useTriTowers} from '@/hooks/useTriTowers';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
const players=[{id:'a',userId:'u1',name:'A',seat:1},{id:'b',userId:'u2',name:'B',seat:2}];
function snapshot(id:string,role:string,paused:boolean){const s=create({sessionId:'session',dealerGameId:id,roundId:'round'},players,Array.from({length:52},(_,i)=>i),1000);return {...project(s,role,paused?1:2,paused?1000:31000),paused,deadline:100000};}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mock.channels.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('CONTRACT Tri dropped resume recovers through shared session recovery for actor and observer hooks',async()=>{
 let paused=true;mock.rpc.mockImplementation(async(_n,args)=>snapshot(args.p_dealer_game_id,args.p_dealer_game_id==='actor'?'a':'b',paused));
 const a=renderHook(()=>useTriTowers('actor')),b=renderHook(()=>useTriTowers('observer'));await act(async()=>{});
 expect(a.result.current.connected).toBe(true);expect(b.result.current.connected).toBe(true);expect(a.result.current.view?.paused).toBe(true);paused=false;
 const before=mock.rpc.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(30000));await act(async()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));
 appendFileSync('e2e/pauseAudit/evidence/phase2-observations.jsonl',JSON.stringify({game:'tri-towers',scenario:'dropped-resume-session-recovery',paused:[a.result.current.view?.paused,b.result.current.view?.paused],connected:[a.result.current.connected,b.result.current.connected],loadsBefore:before,loadsAfter:mock.rpc.mock.calls.length,commands:mock.submit.mock.calls.length})+'\n');
 expect(a.result.current.view?.paused).toBe(false);expect(b.result.current.view?.paused).toBe(false);
});
it('CONTROL Tri focus recovers paused actor and observer without commands',async()=>{
 let paused=true;mock.rpc.mockImplementation(async(_n,args)=>snapshot(args.p_dealer_game_id,args.p_dealer_game_id==='actor'?'a':'b',paused));
 const a=renderHook(()=>useTriTowers('actor')),b=renderHook(()=>useTriTowers('observer'));await act(async()=>{});paused=false;await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(a.result.current.view?.paused).toBe(false);expect(b.result.current.view?.paused).toBe(false);expect(a.result.current.connected).toBe(true);expect(mock.submit).not.toHaveBeenCalled();
});
