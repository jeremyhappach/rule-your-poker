// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useQuintzee,type QuintzeeTransport} from './useQuintzee';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
const snapshot=(revision=1)=>({id:'run',revision,scope:'round',serverAt:Date.now(),theme:'classic',pausedAt:null,status:'active',state:{finished:false,board:{deadline:Date.now()+100000}}}) as QuintzeeSnapshot;
afterEach(()=>{cleanup();sessionStorage.clear();});
it('catches a realtime update arriving while an older load is in flight',async()=>{
 let refresh=()=>{};let resolve!:(v:QuintzeeSnapshot)=>void;
 const load=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue(snapshot(2));
 const transport:QuintzeeTransport={load,send:vi.fn(),subscribe:r=>{refresh=r;return()=>{};}};
 const {result}=renderHook(()=>useQuintzee('run','actor',transport));
 await act(async()=>{refresh();resolve(snapshot(1));});
 await waitFor(()=>expect(result.current.snapshot?.revision).toBe(2));expect(load).toHaveBeenCalledTimes(2);
});
it('retires a definitive rejected command and loads the current board',async()=>{
 const load=vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot(2));
 const send=vi.fn().mockRejectedValue(Object.assign(Error('expired'),{definitive:true}));
 const transport:QuintzeeTransport={load,send,subscribe:()=>()=>{}};
 const {result}=renderHook(()=>useQuintzee('run','actor',transport));await waitFor(()=>expect(result.current.snapshot).not.toBeNull());
 await act(()=>result.current.act({type:'roll',items:[]}));
 expect(result.current.snapshot?.revision).toBe(2);expect(result.current.pending).toBe(false);expect(result.current.error).toBe('expired');
 expect(sessionStorage.getItem('quintzee:run:actor:pending')).toBeNull();
});
it('keeps the exact request after response loss and retries it on reconnect',async()=>{
 const send=vi.fn().mockRejectedValueOnce(Error('lost')).mockResolvedValue(snapshot(2));
 const transport:QuintzeeTransport={load:vi.fn().mockResolvedValue(snapshot()),send,subscribe:()=>()=>{}};
 const {result}=renderHook(()=>useQuintzee('run','actor',transport));await waitFor(()=>expect(result.current.snapshot).not.toBeNull());
 await act(()=>result.current.act({type:'roll',items:[0]}));expect(result.current.pending).toBe(true);
 await act(()=>result.current.reconnect());expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);expect(result.current.pending).toBe(false);
});
it('queues an action behind a read already in flight without dropping or duplicating it',async()=>{let refresh=()=>{};let resolve!:(v:QuintzeeSnapshot)=>void;const load=vi.fn().mockResolvedValueOnce(snapshot()).mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue(snapshot(2)),send=vi.fn().mockResolvedValue(snapshot(2));const transport:QuintzeeTransport={load,send,subscribe:r=>{refresh=r;return()=>{};}};const {result}=renderHook(()=>useQuintzee('run','actor',transport));await waitFor(()=>expect(result.current.snapshot).not.toBeNull());act(()=>refresh());await act(()=>result.current.act({type:'start',items:[]}));await act(()=>result.current.act({type:'start',items:[]}));await act(async()=>resolve(snapshot()));await waitFor(()=>expect(send).toHaveBeenCalledTimes(1));expect(send.mock.calls[0][0].revision).toBe(1);expect(send.mock.calls[0][0].intent.type).toBe('start');});
