// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
import {useElevenUp} from './useElevenUp';
import {usePtownWords} from './usePtownWords';
import {useRoyalFlash} from './useRoyalFlash';
import {useTakeTwo} from './useTakeTwo';
import {useBoxdrop} from './useBoxdrop';
import {useTripFlip} from './useTripFlip';
import {useGolf} from './useGolf';
import {useRacePoker} from './useRacePoker';
import {useBattle31} from './useBattle31';
const flush=async()=>{await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve();});};
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();sessionStorage.clear();vi.useRealTimers();});
const eleven=(revision=1,phase:ElevenSnapshot['board']['phase']='ready'):ElevenSnapshot=>({id:'match',revision,serverAt:1000,scope:'match:round:p1:1',round:1,players:[],board:{phase,deadline:2000,rules:{version:'eleven-up/1',stageMs:120000,introMs:1000,readyMs:20000,holdMs:2000,clearCelebrationMs:3000},slots:[],current:null,exposed:[],passSlot:null,canPass:true,stockRemaining:1,groups:0,score:0,event:{label:'',points:0}},canAct:true,paused:false,finished:false,settled:false,solo:false});
for(const [name,useGame] of [['Royal Flash',useRoyalFlash],['Take Two',useTakeTwo],['Boxdrop',useBoxdrop],['Trip Flip',useTripFlip],['Golf',useGolf],['Race Poker',useRacePoker],['Battle31',useBattle31]] as const){
 it('recovers '+name+': absent subscription ACK by replacing its channel',async()=>{
  const value={...eleven(),phase:'playing',deadline:1e9,board:{phase:'playing',deadline:1e9,rules:{version:'battle-31/1'}}} as any;
  let status!:(v:boolean)=>void;const load=vi.fn(async()=>value),send=vi.fn(async()=>value),subscribe=vi.fn((_r:any,s:any)=>{status=s;return()=>{};}),transport={load,send,subscribe};
  const h=renderHook(()=>useGame('match','user',transport as any));await flush();expect(h.result.current.snapshot?.canAct).toBe(true);
  act(()=>window.dispatchEvent(new Event('focus')));await flush();await act(async()=>h.result.current.reconnect());await flush();
  expect(load.mock.calls.length).toBeGreaterThan(1);expect(subscribe.mock.calls.length).toBeGreaterThan(1);expect(h.result.current.connected).toBe(false);await act(async()=>status(true));await flush();expect(h.result.current.connected).toBe(true);
 });
}
it('recovers 11 Up: absent subscription ACK by replacing its channel; ready action remains blocked',async()=>{
 const load=vi.fn(async()=>eleven()),send=vi.fn(async()=>eleven(2,'playing')),subscribe=vi.fn(()=>()=>{});
 const transport={load,send,subscribe};const h=renderHook(()=>useElevenUp('match','user',transport));await flush();expect(h.result.current.snapshot?.canAct).toBe(true);
 act(()=>window.dispatchEvent(new Event('focus')));await flush();await act(async()=>h.result.current.reconnect());await flush();
 await act(async()=>h.result.current.act({type:'pass'}));expect(load.mock.calls.length).toBeGreaterThan(1);expect(subscribe.mock.calls.length).toBeGreaterThan(1);expect(send).not.toHaveBeenCalled();expect(h.result.current.error).toMatch(/^Reconnecting/);
});
it('recovers 11 Up: dropped ready transition catches up from persisted deadline',async()=>{
 vi.useFakeTimers();let value=eleven(1,'intro');const load=vi.fn(async()=>value);const transport={load,send:vi.fn(),subscribe:(_r:any,status:any)=>{status(true);return()=>{};}};
 const h=renderHook(()=>useElevenUp('match','user',transport));await flush();const before=load.mock.calls.length;value=eleven(2,'ready');
 await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(load.mock.calls.length).toBeGreaterThan(before);expect(h.result.current.snapshot?.board.phase).toBe('ready');
});
it('recovers Words: absent ACK replaces channel while keeping controls blocked',async()=>{
 const value={identity:{sessionId:'s',dealerGameId:'match',roundId:'r'},revision:1,serverAt:1000,board:Array(225).fill(null),rack:[],canAct:true,paused:false} as any;
 const load=vi.fn(async()=>value),send=vi.fn(async()=>value),subscribe=vi.fn(()=>()=>{});const transport={load,send,subscribe};
 const h=renderHook(()=>usePtownWords('match','user',transport));await flush();expect(h.result.current.snapshot?.canAct).toBe(true);
 act(()=>window.dispatchEvent(new Event('focus')));await flush();await act(async()=>h.result.current.reconnect());await flush();
 await act(async()=>expect(await h.result.current.act({type:'pass'})).toBe(false));expect(load.mock.calls.length).toBeGreaterThan(1);expect(subscribe.mock.calls.length).toBeGreaterThan(1);expect(h.result.current.connected).toBe(false);expect(send).not.toHaveBeenCalled();
});
