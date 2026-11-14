// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useChess} from './useChess';
import {newChess} from '@/lib/chess/rules';
import type {ChessSnapshot,ChessTransport} from '@/lib/chess/client';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('replays the same uncertain open after background/resume instead of leaving moves blocked forever',async()=>{
 const state=newChess({identity:{sessionId:'s',dealerGameId:'g',roundId:'g'},players:[{id:'a',userId:'a',name:'A',seat:1,isBot:false},{id:'b',userId:'b',name:'B',seat:2,isBot:false}],mode:'async',backgroundId:''},Date.now());
 let snapshot={...state,id:'g',revision:1,viewerId:'a',canAct:true,serverAt:Date.now(),paused:false,pausedAt:null,finished:false,settled:false,settlement:null,financial:null} as ChessSnapshot;
 let firstReply!:(v:ChessSnapshot)=>void;
 const send=vi.fn<ChessTransport['send']>(async()=>snapshot);
 send.mockImplementationOnce(()=>{snapshot={...snapshot,opened:true,deadline:Date.now()+300000,revision:2};return new Promise(r=>{firstReply=r;});});
 const transport:ChessTransport={load:async()=>snapshot,send,subscribe:(_refresh,status)=>{queueMicrotask(()=>status(true));return()=>{};}};
 const h=renderHook(()=>useChess('g','a',transport));await act(flush);expect(h.result.current.connected).toBe(true);
 let open:Promise<boolean>;act(()=>{open=h.result.current.act({type:'open'});});await act(flush);expect(h.result.current.pending).toBe(true);
 await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));await flush();});
 await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));await flush();});
 expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
 expect(h.result.current.pending).toBe(false);expect(h.result.current.connected).toBe(true);expect(h.result.current.snapshot?.opened).toBe(true);
 await act(async()=>{firstReply({...snapshot,revision:1});await flush();});expect(h.result.current.snapshot?.revision).toBe(2);
 expect(await open!).toBe(false);expect(sessionStorage.length).toBe(0);
});
