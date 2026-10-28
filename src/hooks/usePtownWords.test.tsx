// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePtownWords} from './usePtownWords';
import {acceptWordsSnapshot,type WordsSnapshot} from '@/lib/ptownWords/model';
import type {WordsTransport,Command} from '@/lib/ptownWords/client';
const snapshot={identity:{sessionId:'session',dealerGameId:'match',roundId:'round'},revision:0,serverAt:1000,board:Array(225).fill(null),rack:[],canAct:true,paused:false} as WordsSnapshot;
it('allows a seated waiting player to request pause without admitting gameplay or time-bank actions',async()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});const send=vi.fn(async(_command:Command)=>({...snapshot,canAct:false,revision:1}));
 const transport:WordsTransport={load:async()=>({...snapshot,canAct:false}),subscribe:(_refresh,status)=>{status(true);return()=>{};},send};
 const {result}=renderHook(()=>usePtownWords('match','user',transport));await waitFor(()=>expect(result.current.connected&&!!result.current.snapshot).toBe(true));
 await act(async()=>{expect(await result.current.act({type:'time_bank',items:[{slot:0}]})).toBe(false);expect(await result.current.act({type:'pass'})).toBe(false);expect(await result.current.act({type:'request_pause'})).toBe(true);});
 expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][0].intent).toEqual({type:'request_pause'});
});
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
it('reconnect retries the exact cancellation while waiting and accepts a host pause that won the race',async()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});const request={id:'request-one',playerId:'me',hostUserId:'host',pauseVersion:0},sent:Command[]=[];
 const transport:WordsTransport={load:async()=>({...snapshot,canAct:false,pauseRequest:request}),subscribe:(_refresh,status)=>{status(true);return()=>{};},send:async command=>{sent.push(command);if(sent.length===1)throw Error('Connection uncertain. Reconnect to retry.');return {...snapshot,revision:2,canAct:false,paused:true};}};
 const {result}=renderHook(()=>usePtownWords('match','user',transport));await waitFor(()=>expect(result.current.connected&&!!result.current.snapshot).toBe(true));
 await act(async()=>{expect(await result.current.act({type:'cancel_pause_request',items:[{requestId:request.id}]})).toBe(false);});expect(result.current.pending).toBe(true);
 await act(async()=>{expect(await result.current.reconnect()).toBe(true);});expect(sent[1]).toEqual(sent[0]);expect(result.current.snapshot?.paused).toBe(true);expect(result.current.snapshot?.pauseRequest).toBeUndefined();expect(result.current.pending).toBe(false);
 await act(async()=>{expect(await result.current.act({type:'cancel_pause_request',items:[{requestId:request.id}]})).toBe(false);});expect(sent).toHaveLength(2);
});
it('retries the identical durable command after a committed move loses its reply',async()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 const sent:Command[]=[];
 const transport:WordsTransport={load:async()=>snapshot,subscribe:(_refresh,status)=>{status(true);return()=>{};},send:async command=>{sent.push(command);if(sent.length===1)throw Error('Connection uncertain. Reconnect to retry.');return {...snapshot,revision:1,canAct:false};}};
 const {result}=renderHook(()=>usePtownWords('match','user',transport));
 await waitFor(()=>expect(result.current.connected&&!!result.current.snapshot).toBe(true));
 await act(async()=>{expect(await result.current.act({type:'pass'})).toBe(false);});
 expect(result.current.pending).toBe(true);expect(sessionStorage.length).toBe(1);
 await act(async()=>{expect(await result.current.reconnect()).toBe(true);});
 expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);expect(result.current.pending).toBe(false);expect(result.current.snapshot?.revision).toBe(1);expect(sessionStorage.length).toBe(0);
});
it('rejects mismatched identity and conflicting equal progress, preserving newer state',()=>{
 const newer={...snapshot,revision:2};expect(acceptWordsSnapshot(newer,snapshot,'match')).toBe(newer);
 expect(()=>acceptWordsSnapshot(snapshot,{...snapshot,rack:[{id:1,face:'A',value:1}]},'match')).toThrow('Conflicting');
 expect(()=>acceptWordsSnapshot(null,snapshot,'another-match')).toThrow('Invalid');
});
it('reports repeated identical dictionary rejections separately without advancing the snapshot',async()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});const sent:Command[]=[];
 const transport:WordsTransport={load:async()=>snapshot,subscribe:(_refresh,status)=>{status(true);return()=>{};},send:async command=>{sent.push(command);throw Error('ptown_words:invalid_word:CT');}};
 const {result}=renderHook(()=>usePtownWords('match','user',transport));await waitFor(()=>expect(result.current.connected&&!!result.current.snapshot).toBe(true));
 for(let i=1;i<=2;i++){await act(async()=>{expect(await result.current.act({type:'place',items:[]})).toBe(false);});expect(result.current.errorVersion).toBe(i);expect(result.current.snapshot?.revision).toBe(0);expect(result.current.pending).toBe(false);}
 expect(sent[0].requestId).not.toBe(sent[1].requestId);expect(sessionStorage.length).toBe(0);
});
