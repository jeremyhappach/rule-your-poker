// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {fixtureMatch,act as play,PLAYERS,IDENTITY} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
import {visibleHistory} from '@/lib/run21/history';
const mock=vi.hoisted(()=>({fetch:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/run21/localClient',async importOriginal=>({...await importOriginal<object>(),run21Fetch:mock.fetch,run21Request:mock.request}));
import {useRun21Local} from './useRun21Local';
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();});
it('paints pending placement before the response, suppresses repeats, rolls back rejection and retains the surface on reconnect',async()=>{
 const state=play(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),snapshot={revision:1,serverAt:Date.now(),view:project(state,PLAYERS[0].id),balances:{},finished:false,events:visibleHistory(state,PLAYERS[0].id),eventSequence:state.events.at(-1)!.sequence};
 mock.fetch.mockImplementation(async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(snapshot)}\n\n`));}})}));
 let reject!:(e:Error)=>void;mock.request.mockImplementation(()=>new Promise((_resolve,r)=>{reject=r;}));
 const {result}=renderHook(()=>useRun21Local(IDENTITY.sessionId,IDENTITY.dealerGameId));
 await waitFor(()=>expect(result.current.snapshot?.view.boards[PLAYERS[0].id]?.current).toBeTruthy());
 let action!:Promise<void>;
 act(()=>{action=result.current.onIntent({type:'place',column:0});});
 expect(result.current.snapshot!.view.boards[PLAYERS[0].id]!.columns[0]).toHaveLength(1);
 expect(result.current.snapshot!.view.boards[PLAYERS[0].id]!.deadline).toBeNull();expect(result.current.pending).toBe(true);
 await act(()=>result.current.onIntent({type:'place',column:0}));expect(mock.request).toHaveBeenCalledTimes(1);
 await act(async()=>{reject(new Error('rejected'));await action;});
 expect(result.current.snapshot!.view.boards[PLAYERS[0].id]!.columns[0]).toHaveLength(0);
 act(()=>result.current.reconnect());expect(result.current.snapshot).not.toBeNull();
 await waitFor(()=>expect(mock.fetch).toHaveBeenCalledTimes(2));
 expect(mock.fetch.mock.calls[1][1]).toBe(`events?after=${snapshot.eventSequence}`);
});
