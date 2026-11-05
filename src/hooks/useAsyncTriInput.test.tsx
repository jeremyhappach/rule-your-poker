// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAsyncTriInput} from './useAsyncTriInput';
import {DelayedRequestError} from '@/lib/delayed/client';
const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:mock.request,DelayedRequestError:class extends Error{constructor(message:string,public status:number){super(message);}}}));
let current:any;
const initial=()=>({id:'child',game:'tri-towers',segment:1,revision:1,actor:'me',terminal:false,held:false,expiresAt:new Date(100000).toISOString(),board:{phase:'playing',waste:4,cards:[5,6,7],removed:[],deadline:100000}});
const advance=(index:number)=>({...current,revision:current.revision+1,board:{...current.board,waste:current.board.cards[index],removed:[...current.board.removed,index]}});
function mount(){return renderHook(()=>useAsyncTriInput({childId:'child',userId:'me',read:()=>current,accept:v=>{current=v;},available:true,now:()=>1000,enabled:true,interruptAudio:vi.fn()}));}
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve();});}
beforeEach(()=>{sessionStorage.clear();mock.request.mockReset();current=initial();});afterEach(()=>cleanup());
it('marks pending immediately, serializes rapid moves and freezes each confirmed revision',async()=>{
 const responses:((s:any)=>void)[]=[];mock.request.mockImplementation(()=>new Promise(r=>responses.push(r)));const h=mount();
 act(()=>{h.result.current.enqueue({type:'remove',index:0});h.result.current.enqueue({type:'remove',index:1});});
 expect(h.result.current.pendingCards).toEqual([0,1]);expect(current.board.removed).toEqual([]);expect(mock.request).toHaveBeenCalledTimes(1);
 await act(async()=>responses.shift()!(advance(0)));await flush();expect(mock.request).toHaveBeenCalledTimes(2);
 expect(mock.request.mock.calls[0][0]).toMatchObject({revision:1,segment:1,intent:{type:'remove',index:0}});
 expect(mock.request.mock.calls[1][0]).toMatchObject({revision:2,segment:1,intent:{type:'remove',index:1}});
 await act(async()=>responses.shift()!(advance(1)));expect(current.board.removed).toEqual([0,1]);expect(h.result.current.busy).toBe(false);
});
it('refreshes a rejected move, cancels its unsent successors and admits a new play',async()=>{
 mock.request.mockRejectedValueOnce(new DelayedRequestError('delayed:stale_action',409)).mockResolvedValueOnce({...initial(),revision:2});const h=mount();
 act(()=>{h.result.current.enqueue({type:'remove',index:0});h.result.current.enqueue({type:'remove',index:1});});await flush();
 expect(mock.request.mock.calls.map(([c])=>c.op)).toEqual(['action','state']);expect(h.result.current.pendingCards).toEqual([]);expect(h.result.current.uncertain).toBe(false);
 mock.request.mockImplementation(async c=>advance(c.intent.index));act(()=>h.result.current.enqueue({type:'remove',index:0}));await flush();expect(current.board.removed).toEqual([0]);
});
it('restores and resolves a lost response using the exact request ID, without sending the queued move',async()=>{
 mock.request.mockRejectedValueOnce(new Error('network'));let h=mount();act(()=>{h.result.current.enqueue({type:'remove',index:0});h.result.current.enqueue({type:'remove',index:1});});await flush();
 const command=mock.request.mock.calls[0][0];expect(h.result.current.uncertain).toBe(true);h.unmount();h=mount();
 expect(h.result.current.uncertain).toBe(true);mock.request.mockResolvedValueOnce(advance(0));await act(async()=>h.result.current.recover());
 expect(mock.request.mock.calls[1][0]).toEqual(command);expect(mock.request).toHaveBeenCalledTimes(2);expect(h.result.current.busy).toBe(false);expect(h.result.current.uncertain).toBe(false);
});
it('cancels successors at terminal/segment boundaries',async()=>{
 mock.request.mockResolvedValueOnce({...initial(),terminal:true,segment:2,actor:'other',revision:2,board:null});const h=mount();
 act(()=>{h.result.current.enqueue({type:'remove',index:0});h.result.current.enqueue({type:'remove',index:1});});await flush();expect(mock.request).toHaveBeenCalledTimes(1);expect(h.result.current.pendingCards).toEqual([]);
});
it('ignores a response after unmount and preserves its receipt for recovery',async()=>{
 let resolve!:(s:any)=>void;mock.request.mockImplementation(()=>new Promise(r=>resolve=r));const h=mount();act(()=>h.result.current.enqueue({type:'remove',index:0}));h.unmount();resolve(advance(0));await flush();
 expect(current.revision).toBe(1);expect(sessionStorage.length).toBe(1);
});
it('ignores a rejected-move refresh that returns after unmount',async()=>{
 let resolve!:(s:any)=>void;mock.request.mockRejectedValueOnce(new DelayedRequestError('stale',409)).mockImplementationOnce(()=>new Promise(r=>resolve=r));
 const h=mount();act(()=>h.result.current.enqueue({type:'remove',index:0}));await flush();h.unmount();resolve({...initial(),revision:2});await flush();
 expect(current.revision).toBe(1);expect(sessionStorage.length).toBe(1);
});
