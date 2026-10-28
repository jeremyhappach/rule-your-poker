// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {create,project,reduce} from '@/lib/triTowers/referenceEngine';
const mock=vi.hoisted(()=>({autoSubscribe:true,rpc:vi.fn(),submit:vi.fn(),channels:[] as {notify:()=>void;status:(s:string)=>void}[]}));
vi.mock('@/lib/triTowers/client',async original=>({...await original<typeof import('@/lib/triTowers/client')>(),triTowersRpc:mock.rpc,submit:mock.submit}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{
 const record={notify:()=>{},status:(_s:string)=>{}};mock.channels.push(record);
 const channel={on:(_event:unknown,_filter:unknown,notify:()=>void)=>{record.notify=notify;return channel;},subscribe:(status:(s:string)=>void)=>{record.status=status;if(mock.autoSubscribe)status('SUBSCRIBED');return channel;}};return channel;
},removeChannel:vi.fn()}}));
import {useTriTowers} from './useTriTowers';
const players=[{id:'a',userId:'u1',name:'A',seat:1},{id:'b',userId:'u2',name:'B',seat:2}];
const initial=create({sessionId:'s',dealerGameId:'d',roundId:'r'},players,Array.from({length:52},(_,i)=>i),Date.now());
beforeEach(()=>{vi.clearAllMocks();mock.autoSubscribe=true;mock.channels.length=0;mock.rpc.mockResolvedValue(project(initial,'a'));});
afterEach(cleanup);
it('retries boundary reads only a bounded number of times when the recovery worker is late',async()=>{
 vi.useFakeTimers();
 try {
  const intro={...project(initial,'a'),phase:'intro',serverAt:Date.now(),deadline:Date.now()+2500};
  mock.rpc.mockResolvedValue(intro);
  const h=renderHook(()=>useTriTowers('d'));await act(async()=>{});
  const before=mock.rpc.mock.calls.length;
  await act(()=>vi.advanceTimersByTimeAsync(2500));expect(h.result.current.view?.phase).toBe('intro');
  mock.rpc.mockResolvedValue({...intro,phase:'ready',revision:1,serverAt:intro.deadline+1000,deadline:intro.deadline+30000});
  await act(()=>vi.advanceTimersByTimeAsync(1000));expect(h.result.current.view?.phase).toBe('ready');
  await act(()=>vi.advanceTimersByTimeAsync(3000));expect(mock.rpc.mock.calls.length).toBe(before+2);
 } finally {cleanup();vi.useRealTimers();}
});
it('bounds failed subscription replacements and ignores callbacks from discarded channels',async()=>{
 mock.autoSubscribe=false;
 const h=renderHook(()=>useTriTowers('d'));await act(async()=>{});
 for(let i=0;i<3;i++)await act(async()=>mock.channels[i].status('TIMED_OUT'));
 expect(mock.channels).toHaveLength(3);expect(h.result.current.connected).toBe(false);
 await act(async()=>mock.channels[0].status('SUBSCRIBED'));expect(h.result.current.connected).toBe(false);
});
it('catches up once at the persisted intro deadline when its realtime edge is lost',async()=>{
 vi.useFakeTimers();
 try {
  const intro={...project(initial,'a'),phase:'intro',serverAt:Date.now(),deadline:Date.now()+2500};
  mock.rpc.mockResolvedValue(intro);
  const {result}=renderHook(()=>useTriTowers('d'));await act(async()=>{});
  const before=mock.rpc.mock.calls.length;
  mock.rpc.mockResolvedValue({...intro,phase:'ready',revision:1,serverAt:intro.deadline,deadline:intro.deadline+30000});
  await act(()=>vi.advanceTimersByTimeAsync(2500));
  expect(mock.rpc.mock.calls.length).toBe(before+1);expect(result.current.view?.phase).toBe('ready');
 } finally {cleanup();vi.useRealTimers();}
});
it('replaces a stalled channel on focus, rejects its late callback, and requires new catch-up',async()=>{
 mock.autoSubscribe=false;
 const {result}=renderHook(()=>useTriTowers('d'));await act(async()=>{});
 expect(result.current.connected).toBe(false);
 await act(()=>result.current.act({type:'start'}));expect(mock.submit).not.toHaveBeenCalled();
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(mock.channels).toHaveLength(2);
 await act(async()=>mock.channels[0].status('SUBSCRIBED'));
 expect(result.current.connected).toBe(false);
 let resolve!:(v:unknown)=>void;mock.rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 await act(async()=>mock.channels[1].status('SUBSCRIBED'));expect(result.current.connected).toBe(false);
 await act(async()=>resolve(project(initial,'a')));expect(result.current.connected).toBe(true);
});
it('aligns the first result frame to server time even when the client clock differs',async()=>{
 const snapshot=project(initial,'a',1,1234);mock.rpc.mockResolvedValue(snapshot);
 const {result}=renderHook(()=>useTriTowers('d'));await waitFor(()=>expect(result.current.view?.revision).toBe(1));
 expect(result.current.now).toBeGreaterThanOrEqual(1234);expect(result.current.now).toBeLessThan(2000);
});
it('spectators receive each board revision through realtime and resume after channel reconnect',async()=>{
 mock.rpc.mockResolvedValue(project(initial,'b'));const {result}=renderHook(()=>useTriTowers('d'));
 await waitFor(()=>expect(result.current.connected).toBe(true));
 await act(()=>result.current.act({type:'start'}));expect(mock.submit).not.toHaveBeenCalled();
 const playing=reduce(initial,{type:'start'},Date.now(),()=>initial.deck),next=project(reduce(playing,{type:'draw'},Date.now(),()=>initial.deck),'b',2);
 mock.rpc.mockResolvedValue(next);await act(()=>mock.channels[0].notify());
 await waitFor(()=>expect(result.current.view?.revision).toBe(2));expect(result.current.view?.waste).toBe(next.waste);
 act(()=>mock.channels[0].status('CHANNEL_ERROR'));expect(result.current.connected).toBe(false);expect(result.current.view).toEqual(next);
 await act(()=>mock.channels[0].status('SUBSCRIBED'));await waitFor(()=>expect(result.current.connected).toBe(true));
});
it('suppresses repeated taps and retries the same command UUID after a transport failure',async()=>{
 const {result}=renderHook(()=>useTriTowers('d'));await waitFor(()=>expect(result.current.view).not.toBeNull());
 mock.submit.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(project(reduce(initial,{type:'start'},Date.now(),()=>initial.deck),'a',1));
 await act(async()=>{await Promise.all([result.current.act({type:'start'}),result.current.act({type:'start'})]);});
 expect(mock.submit).toHaveBeenCalledTimes(2);expect(mock.submit.mock.calls[0][0]).toEqual(mock.submit.mock.calls[1][0]);expect(result.current.pending).toBe(false);
});
it('retains the board during resync, rejects regression, and drops responses from an old dealer game',async()=>{
 const {result,rerender}=renderHook(({id})=>useTriTowers(id),{initialProps:{id:'d'}});await waitFor(()=>expect(result.current.view).not.toBeNull());
 const before=result.current.view;let resolve!:(v:unknown)=>void;mock.rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 act(()=>result.current.reconnect());expect(result.current.view).toEqual(before);
 rerender({id:'other'});expect(result.current.view).toBeNull();
 await act(()=>resolve(project(initial,'a',5)));expect(result.current.view).toBeNull();
});
it('gives a new dealer game its own bounded transport recovery budget',async()=>{
 mock.autoSubscribe=false;
 const h=renderHook(({id})=>useTriTowers(id),{initialProps:{id:'d'}});await act(async()=>{});
 for(let i=0;i<3;i++)await act(async()=>mock.channels[i].status('TIMED_OUT'));
 expect(mock.channels).toHaveLength(3);
 mock.rpc.mockResolvedValue({...project(initial,'a'),identity:{...initial.identity,dealerGameId:'next'}});
 h.rerender({id:'next'});await act(async()=>{});
 await act(async()=>mock.channels[3].status('TIMED_OUT'));expect(mock.channels).toHaveLength(5);
 await act(async()=>mock.channels[0].status('SUBSCRIBED'));expect(h.result.current.connected).toBe(false);
});
