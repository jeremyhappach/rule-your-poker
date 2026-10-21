// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useRacePoker,type RacePokerTransport} from './useRacePoker';
import {racePokerPlayWindow,type RacePokerSnapshot} from '@/lib/racePoker/model';
const fixture=(_unused=false):RacePokerSnapshot=>({id:'a',scope:'a:1:p',identity:{sessionId:'s',dealerGameId:'a',roundId:'r'},revision:1,serverAt:1000,round:1,viewerId:'u',canAct:true,paused:false,pausedAt:null,finished:false,settled:false,players:[{id:'u',name:'You',score:0,active:true,seat:1,chips:100}],results:[],settlement:null,financial:{balances:{u:100},resultId:null,batch:null},board:{rules:{version:'race-poker/1',handMs:30000,holdMs:2000,target:48000,roundCap:16},phase:'playing',deadline:31000,hand:[],choices:[0,1,2],result:null,finalHand:false,event:{label:'',points:0}}});
function setup(solo=false){let status!:(v:boolean)=>void,refresh!:()=>void;const value=fixture(solo),unsubscribe=vi.fn();const transport:RacePokerTransport={load:vi.fn(async()=>value),send:vi.fn(async()=>({...value,revision:2,board:{...value.board,phase:'playing' as const,deadline:153500,hand:[0]}})),subscribe:vi.fn((r,s)=>{refresh=r;status=s;return unsubscribe;})};return {value,transport,unsubscribe,status:(v:boolean)=>status(v),refresh:()=>refresh()};}
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();});afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('does not call initial loading a reconnect or a pending play and retains the board on disconnect',async()=>{
 const f=setup(),hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});
 expect(hook.result.current.error).toBe('');expect(hook.result.current.pending).toBe(false);expect(hook.result.current.connected).toBe(false);
 await act(async()=>f.status(true));const board=hook.result.current.snapshot;
 act(()=>f.status(false));expect(hook.result.current.snapshot).toBe(board);expect(hook.result.current.error).toContain('Connection interrupted');
 await act(()=>hook.result.current.act({type:'choose',items:[0]}));expect(f.transport.send).not.toHaveBeenCalled();
});
it('ordinary refreshes keep the board and input available; renders do not recreate the subscription',async()=>{
 const f=setup(),value={...f.value,board:{...f.value.board,phase:'playing' as const,deadline:23500}};vi.mocked(f.transport.load).mockResolvedValue(value);
 const hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 let finish!:(v:RacePokerSnapshot)=>void;vi.mocked(f.transport.load).mockImplementation(()=>new Promise(r=>finish=r));act(()=>hook.result.current.reconnect());
 expect(hook.result.current.pending).toBe(false);expect(hook.result.current.snapshot).toBe(value);
 await act(()=>hook.result.current.act({type:'choose',items:[0]}));expect(f.transport.send).toHaveBeenCalledTimes(1);
 await act(async()=>finish(value));await act(()=>vi.advanceTimersByTimeAsync(500));expect(f.transport.subscribe).toHaveBeenCalledTimes(1);hook.unmount();expect(f.unsubscribe).toHaveBeenCalledTimes(1);
});
it('retains the exact uncertain command and retries it without clearing the mounted board',async()=>{
 const f=setup();vi.mocked(f.transport.load).mockResolvedValue({...f.value,board:{...f.value.board,phase:'playing',deadline:23500}});vi.mocked(f.transport.send).mockRejectedValueOnce(Error('Connection uncertain.')).mockResolvedValueOnce({...f.value,revision:2});
 const hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));await act(()=>hook.result.current.act({type:'choose',items:[2]}));
 expect(hook.result.current.pending).toBe(true);expect(hook.result.current.snapshot).not.toBeNull();await act(async()=>hook.result.current.reconnect());
 expect(vi.mocked(f.transport.send).mock.calls[0]).toEqual(vi.mocked(f.transport.send).mock.calls[1]);expect(hook.result.current.pending).toBe(false);
});
it('recovers a brief browser outage without waiting for a new subscription handshake',async()=>{
 const f=setup(),hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);act(()=>window.dispatchEvent(new Event('offline')));expect(hook.result.current.connected).toBe(false);
 online.mockReturnValue(true);await act(async()=>window.dispatchEvent(new Event('online')));expect(hook.result.current.connected).toBe(true);expect(f.transport.subscribe).toHaveBeenCalledTimes(1);
});

it('marks the recovered snapshot itself silent when connection returns before its response',async()=>{
 const f=setup(),hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 act(()=>f.status(false));let finish!:(v:RacePokerSnapshot)=>void;vi.mocked(f.transport.load).mockImplementation(()=>new Promise(r=>finish=r));
 await act(async()=>f.status(true));const beforeResponse=hook.result.current.epoch;
 await act(async()=>finish({...f.value,revision:2,board:{...f.value.board,phase:'stage_complete'}}));
 expect(hook.result.current.epoch).toBeGreaterThan(beforeResponse);expect(hook.result.current.snapshot?.board.phase).toBe('stage_complete');
});

it('allows v2 control reclaim while paused, expired and outside the active turn',async()=>{
 const f=setup();const value={...f.value,canAct:false,paused:true,players:f.value.players.map(p=>({...p,active:false,autoPlay:true})),board:{...f.value.board,rules:{...f.value.board.rules,version:'race-poker/2' as const},deadline:500}};
 vi.mocked(f.transport.load).mockResolvedValue(value);
 const hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 await act(()=>hook.result.current.act({type:'choose',items:[0]}));expect(f.transport.send).not.toHaveBeenCalled();
 await act(()=>hook.result.current.act({type:'autoplay',enabled:false}));expect(vi.mocked(f.transport.send).mock.calls[0][0].intent).toEqual({type:'autoplay',enabled:false});
});

it('retries an uncertain autoplay change with the original identity after reconnect',async()=>{
 const f=setup();vi.mocked(f.transport.load).mockResolvedValue({...f.value,board:{...f.value.board,rules:{...f.value.board.rules,version:'race-poker/2'}}});
 vi.mocked(f.transport.send).mockRejectedValueOnce(Error('Connection uncertain.')).mockResolvedValueOnce({...f.value,revision:2});
 const hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 await act(()=>hook.result.current.act({type:'autoplay',enabled:false}));expect(hook.result.current.pending).toBe(true);
 await act(async()=>hook.result.current.reconnect());expect(vi.mocked(f.transport.send).mock.calls[0]).toEqual(vi.mocked(f.transport.send).mock.calls[1]);expect(hook.result.current.pending).toBe(false);
});

it('does not offer v2 controls to legacy games',async()=>{
 const f=setup(),hook=renderHook(()=>useRacePoker('a','u',f.transport));await act(async()=>{});await act(async()=>f.status(true));
 await act(()=>hook.result.current.act({type:'autoplay',enabled:true}));expect(f.transport.send).not.toHaveBeenCalled();
});
