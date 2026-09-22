// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {fixtureMatch,act as play,PLAYERS,IDENTITY} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
import {visibleHistory} from '@/lib/run21/history';
import {applyCommand} from '@/lib/run21/engine';
const mock=vi.hoisted(()=>({fetch:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/run21/localClient',async importOriginal=>({...await importOriginal<object>(),run21Fetch:mock.fetch,run21Request:mock.request}));
import {useRun21Local} from './useRun21Local';
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();});
it('keeps one subscription across revisions and admits commands while the spectator stream reconnects',async()=>{
 const state=play(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0);
 const events=visibleHistory(state,PLAYERS[0].id);
 const snapshot={revision:1,serverAt:0,view:project(state,PLAYERS[0].id),balances:{},finished:false,events,eventSequence:events.at(-1)!.sequence};
 let stream!:ReadableStreamDefaultController<Uint8Array>;
 mock.fetch.mockImplementation(async()=>({ok:true,body:new ReadableStream({start(c){stream=c;c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(snapshot)}\n\n`));}})}));
 mock.request.mockImplementation(async(_game,_path,command)=>{
  const next=applyCommand(state,command,{kind:'player',playerId:PLAYERS[0].id},750).state;
  return {...snapshot,revision:2,serverAt:750,view:project(next,PLAYERS[0].id),events:visibleHistory(next,PLAYERS[0].id,snapshot.eventSequence),eventSequence:next.events.at(-1)!.sequence,requestId:command.requestId};
 });
 const {result}=renderHook(()=>useRun21Local(IDENTITY.sessionId,IDENTITY.dealerGameId));
 await waitFor(()=>expect(result.current.connected).toBe(true));
 await act(async()=>stream.error(new Error('network')));
 expect(result.current.connected).toBe(false);
 await act(()=>result.current.onIntent({type:'pass'}));
 expect(mock.request).toHaveBeenCalledTimes(1);
 expect(result.current.snapshot!.view.boards[PLAYERS[0].id]!.passesUsed).toBe(1);
 expect(result.current.pending).toBe(false);expect(mock.fetch).toHaveBeenCalledTimes(1);
});
it('presents the current authoritative card immediately after a missed event backlog',async()=>{
 let state=play(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0);
 state=play(state,PLAYERS[0].id,{type:'place',column:0},750);
 state=play(state,PLAYERS[0].id,{type:'place',column:1},1500);
 const events=visibleHistory(state,PLAYERS[0].id);
 const snapshot={revision:3,serverAt:1500,view:project(state,PLAYERS[0].id),balances:{},finished:false,events,eventSequence:events.at(-1)!.sequence};
 mock.fetch.mockImplementation(async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(snapshot)}\n\n`));}})}));
 const {result}=renderHook(()=>useRun21Local(IDENTITY.sessionId,IDENTITY.dealerGameId));
 await waitFor(()=>expect(result.current.connected).toBe(true));
 expect(result.current.snapshot!.view).toEqual(snapshot.view);
 expect(result.current.pending).toBe(false);expect(mock.fetch).toHaveBeenCalledTimes(1);
});
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
it('renders the accepted next upcard in the same response without another fetch or animation wait',async()=>{
 const state=play(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),events=visibleHistory(state,PLAYERS[0].id);
 const snapshot={revision:1,serverAt:0,view:project(state,PLAYERS[0].id),balances:{},finished:false,events,eventSequence:events.at(-1)!.sequence};
 mock.fetch.mockImplementation(async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(snapshot)}\n\n`));}})}));
 mock.request.mockImplementation(async(_game,_path,command)=>{
  const accepted=applyCommand(state,command,{kind:'player',playerId:PLAYERS[0].id},750);
  expect(accepted.status).toBe('accepted');
  const next=visibleHistory(accepted.state,PLAYERS[0].id).filter(e=>e.sequence>snapshot.eventSequence);
  return {...snapshot,revision:2,serverAt:750,view:project(accepted.state,PLAYERS[0].id),events:next,eventSequence:next.at(-1)!.sequence,requestId:command.requestId};
 });
 const {result}=renderHook(()=>useRun21Local(IDENTITY.sessionId,IDENTITY.dealerGameId));
 await waitFor(()=>expect(result.current.snapshot?.view.boards[PLAYERS[0].id]?.current).toBeTruthy());
 const first=result.current.snapshot!.view.boards[PLAYERS[0].id]!.current;
 await act(()=>result.current.onIntent({type:'place',column:0}));
 const board=result.current.snapshot!.view.boards[PLAYERS[0].id]!;
 expect(board.columns[0]).toEqual([first]);expect(board.current).toBeTruthy();expect(board.current).not.toEqual(first);
 expect(board.deadline!-board.startedAt!).toBe(250000);expect(mock.fetch).toHaveBeenCalledTimes(1);expect(mock.request).toHaveBeenCalledTimes(1);
 expect(result.current.pending).toBe(false);
});
