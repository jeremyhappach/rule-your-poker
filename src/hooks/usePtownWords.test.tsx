// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePtownWords} from './usePtownWords';
import {acceptWordsSnapshot,type WordsSnapshot} from '@/lib/ptownWords/model';
import type {WordsTransport,Command} from '@/lib/ptownWords/client';
const snapshot={identity:{sessionId:'session',dealerGameId:'match',roundId:'round'},revision:0,serverAt:1000,board:Array(225).fill(null),rack:[],canAct:true,paused:false} as WordsSnapshot;
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
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
