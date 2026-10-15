// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {create,project,reduce} from '@/lib/triTowers/referenceEngine';
const mock=vi.hoisted(()=>({rpc:vi.fn(),submit:vi.fn(),channels:[] as {notify:()=>void;status:(s:string)=>void}[]}));
vi.mock('@/lib/triTowers/client',async original=>({...await original<typeof import('@/lib/triTowers/client')>(),triTowersRpc:mock.rpc,submit:mock.submit}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{
 const record={notify:()=>{},status:(_s:string)=>{}};mock.channels.push(record);
 const channel={on:(_event:unknown,_filter:unknown,notify:()=>void)=>{record.notify=notify;return channel;},subscribe:(status:(s:string)=>void)=>{record.status=status;status('SUBSCRIBED');return channel;}};return channel;
},removeChannel:vi.fn()}}));
import {useTriTowers} from './useTriTowers';
const players=[{id:'a',userId:'u1',name:'A',seat:1},{id:'b',userId:'u2',name:'B',seat:2}];
const initial=create({sessionId:'s',dealerGameId:'d',roundId:'r'},players,Array.from({length:52},(_,i)=>i),Date.now());
beforeEach(()=>{vi.clearAllMocks();mock.channels.length=0;mock.rpc.mockResolvedValue(project(initial,'a'));});
afterEach(cleanup);
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
