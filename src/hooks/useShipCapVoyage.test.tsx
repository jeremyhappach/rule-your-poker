// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useShipCapVoyage} from './useShipCapVoyage';
import type {VoyageSnapshot,VoyageCommand} from '@/lib/shipCapVoyage/model';
const id='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000002';
const initial:VoyageSnapshot={id,revision:1,status:'active',ruleset:'ship-cap-voyage/1',serverAt:1000,round:1,roundId:id+':1',startedAt:1000,roll:0,dice:[],locked:[],cargo:null,quote:null,banks:[],results:[],score:0,phase:'playing',result:null,completion:null};
beforeEach(()=>{sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(cleanup);
function fixture(){let current=initial;const send=vi.fn(async(c:VoyageCommand)=>current={...current,revision:c.revision+1,roll:current.roll+1,dice:[6,5,4,6,6],locked:[0,1,2],cargo:12,quote:{base:800,bonus:330,points:1130}});const load=vi.fn(async()=>current);const subscribe=(_changed:()=>void,status:(ready:boolean)=>void)=>{queueMicrotask(()=>status(true));return()=>{};};return{send,load,subscribe};}
describe('Voyage manual action and recovery ownership',()=>{
 it('mount, realtime readiness and reconnect never roll',async()=>{
  const transport=fixture();const {result}=renderHook(()=>useShipCapVoyage(id,user,transport,true));await waitFor(()=>expect(result.current.ready).toBe(true));expect(result.current.snapshot?.roll).toBe(0);expect(result.current.roundCue).toBe(id+':1');
  act(()=>result.current.reconnect());await waitFor(()=>expect(result.current.ready).toBe(true));expect(transport.send).not.toHaveBeenCalled();expect(result.current.snapshot?.dice).toEqual([]);
 });
 it('synchronously serializes rapid roll taps',async()=>{
  const transport=fixture();const {result}=renderHook(()=>useShipCapVoyage(id,user,transport,true));await waitFor(()=>expect(result.current.ready).toBe(true));
  act(()=>{result.current.act('roll');result.current.act('roll');result.current.act('roll');});await waitFor(()=>expect(result.current.snapshot?.roll).toBe(1));expect(transport.send).toHaveBeenCalledTimes(1);
 });
 it('retries the exact uncertain command without generating a new request',async()=>{
  const transport=fixture(),normal=transport.send.getMockImplementation()!;transport.send.mockRejectedValueOnce(Error('Connection uncertain'));
  const {result}=renderHook(()=>useShipCapVoyage(id,user,transport,true));await waitFor(()=>expect(result.current.ready).toBe(true));act(()=>result.current.act('roll'));await waitFor(()=>expect(result.current.pending).toBe(true));
  const command=transport.send.mock.calls[0][0];transport.send.mockImplementation(normal);act(()=>result.current.reconnect());await waitFor(()=>expect(result.current.snapshot?.roll).toBe(1));expect(transport.send.mock.calls[1][0]).toEqual(command);expect(result.current.cue).toBeNull();
 });
});
