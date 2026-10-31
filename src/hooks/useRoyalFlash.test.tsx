// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useRoyalFlash,type RoyalTransport} from './useRoyalFlash';
import {royalPlayWindow,type RoyalSnapshot} from '@/lib/royalFlash/model';
const fixture=(solo=false):RoyalSnapshot=>({id:'a',scope:'a:1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo,players:[{id:'u',name:'You',score:0,active:true}],board:{rules:{version:'royal-flash/3',introMs:2500,readyMs:20000,stageMs:150000,holdMs:21000,clearCelebrationMs:0},phase:'intro',deadline:3500,slots:Array(25).fill(null),current:12,stockRemaining:51,placements:0,handPoints:0,lines:[],score:0,event:{label:'',points:0}}});
function setup(solo=false){let status!:(v:boolean)=>void,refresh!:()=>void;const value=fixture(solo),unsubscribe=vi.fn();const transport:RoyalTransport={load:vi.fn(async()=>value),send:vi.fn(async()=>({...value,revision:2,board:{...value.board,phase:'playing' as const,deadline:153500,placements:1}})),subscribe:vi.fn((r,s)=>{refresh=r;status=s;return unsubscribe;})};return {value,transport,unsubscribe,status:(v:boolean)=>status(v),refresh:()=>refresh()};}
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();});afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('does not call initial loading a reconnect or a pending play and retains the board on disconnect',async()=>{
 const f=setup(),hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});
 expect(hook.result.current.error).toBe('');expect(hook.result.current.pending).toBe(false);expect(hook.result.current.connected).toBe(false);
 await act(async()=>f.status(true));const board=hook.result.current.snapshot;
 act(()=>f.status(false));expect(hook.result.current.snapshot).toBe(board);expect(hook.result.current.error).toContain('Connection interrupted');
 await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).not.toHaveBeenCalled();
});
it('blocks before the persisted intro deadline and accepts multiplayer first play without a worker update',async()=>{
 const f=setup(),hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).not.toHaveBeenCalled();
 vi.mocked(f.transport.load).mockResolvedValue({...f.value,serverAt:3500});await act(()=>vi.advanceTimersByTimeAsync(2500));await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).toHaveBeenCalledTimes(1);
});
it('Arcade requests Ready once at the boundary and never unlocks on its local clock alone',async()=>{
 const f=setup(true),hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));const before=vi.mocked(f.transport.load).mock.calls.length;
 await act(()=>vi.advanceTimersByTimeAsync(2500));expect(f.transport.load).toHaveBeenCalledTimes(before+1);
 await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).not.toHaveBeenCalled();
 vi.mocked(f.transport.load).mockResolvedValue({...f.value,revision:2,serverAt:3500,board:{...f.value.board,phase:'ready',deadline:23500}});
 await act(async()=>f.refresh());await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).toHaveBeenCalledTimes(1);
});
it('ordinary refreshes keep the board and input available; renders do not recreate the subscription',async()=>{
 const f=setup(),value={...f.value,board:{...f.value.board,phase:'ready' as const,deadline:23500}};vi.mocked(f.transport.load).mockResolvedValue(value);
 const hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 let finish!:(v:RoyalSnapshot)=>void;vi.mocked(f.transport.load).mockImplementation(()=>new Promise(r=>finish=r));act(()=>hook.result.current.reconnect());
 expect(hook.result.current.pending).toBe(false);expect(hook.result.current.snapshot).toBe(value);
 await act(()=>hook.result.current.act({type:'place',index:0}));expect(f.transport.send).toHaveBeenCalledTimes(1);
 await act(async()=>finish(value));await act(()=>vi.advanceTimersByTimeAsync(500));expect(f.transport.subscribe).toHaveBeenCalledTimes(1);hook.unmount();expect(f.unsubscribe).toHaveBeenCalledTimes(1);
});
it('retains the exact uncertain command and retries it without clearing the mounted board',async()=>{
 const f=setup();vi.mocked(f.transport.load).mockResolvedValue({...f.value,board:{...f.value.board,phase:'ready',deadline:23500}});vi.mocked(f.transport.send).mockRejectedValueOnce(Error('Connection uncertain.')).mockResolvedValueOnce({...f.value,revision:2});
 const hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));await act(()=>hook.result.current.act({type:'place',index:3}));
 expect(hook.result.current.pending).toBe(true);expect(hook.result.current.snapshot).not.toBeNull();await act(async()=>hook.result.current.reconnect());
 expect(vi.mocked(f.transport.send).mock.calls[0]).toEqual(vi.mocked(f.transport.send).mock.calls[1]);expect(hook.result.current.pending).toBe(false);
});
it('keeps deadline, pause and phase boundaries authoritative',()=>{
 const b=fixture().board;expect(royalPlayWindow(b,3499).playable).toBe(false);expect(royalPlayWindow(b,3500).playable).toBe(true);expect(royalPlayWindow(b,23500).playable).toBe(false);expect(royalPlayWindow(b,3500,false).playable).toBe(false);expect(royalPlayWindow({...b,phase:'stage_complete'},3600).playable).toBe(false);
});
it('replaces an interrupted channel and requires a fresh acknowledgement before recovery',async()=>{
 const f=setup(),hook=renderHook(()=>useRoyalFlash('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);act(()=>window.dispatchEvent(new Event('offline')));expect(hook.result.current.connected).toBe(false);
 online.mockReturnValue(true);await act(async()=>window.dispatchEvent(new Event('online')));expect(hook.result.current.connected).toBe(false);expect(f.transport.subscribe).toHaveBeenCalledTimes(2);await act(async()=>f.status(true));expect(hook.result.current.connected).toBe(true);
});
