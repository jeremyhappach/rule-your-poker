// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useDrop357} from './useDrop357';
import type {DropCommand,DropSnapshot} from '@/lib/drop357/model';
const flush=async()=>{await act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();});};
const initial=():DropSnapshot=>({id:'run',revision:1,status:'active',ruleset:'357-drop/3',serverAt:1000,roundId:'run:1',round:1,rounds:3,score:0,phase:'playing',lanes:[[null,null,null],[null,null,null,null,null],[null,null,null,null,null,null,null]],laneResults:[null,null,null],current:10,stockLeft:51,passesLeft:5,placements:0,startedAt:1000,deadline:121000,result:null,completion:null});
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();sessionStorage.clear();});
it('lands immediately, binds each tap to the revealed card and releases on its exact receipt before HTTP completes',async()=>{
 let value=initial(),changed!:()=>void;const commands:DropCommand[]=[],replies:((v:DropSnapshot)=>void)[]=[];
 const transport={load:async()=>value,send:(command:DropCommand)=>{commands.push(command);return new Promise<DropSnapshot>(resolve=>replies.push(resolve));},subscribe:(change:()=>void,status:(v:boolean)=>void)=>{changed=change;status(true);return()=>{};}};
 const h=renderHook(()=>useDrop357('run','user',transport,true));await flush();
 act(()=>{h.result.current.act('place',[1,3]);h.result.current.act('place',[2,5]);});
 expect(commands).toHaveLength(1);expect(h.result.current.placement).toMatchObject({lane:1,slot:3,card:10});expect(h.result.current.pending).toBe(true);
 value={...value,revision:2,serverAt:1020,current:23,placements:1,lanes:[value.lanes[0],[null,null,null,10,null],value.lanes[2]],acceptedRequestId:commands[0].requestId};
 act(changed);await flush();expect(h.result.current.pending).toBe(false);expect(h.result.current.snapshot?.current).toBe(23);
 act(()=>h.result.current.act('place',[2,5],1));expect(commands).toHaveLength(1);
 act(()=>h.result.current.act('place',[2,5],2));expect(commands).toHaveLength(2);expect(commands[1].revision).toBe(2);expect(h.result.current.placement?.card).toBe(23);
 await act(async()=>replies[0](value));expect(h.result.current.pending).toBe(true);expect(h.result.current.placement?.card).toBe(23);
 value={...value,revision:3,serverAt:1040,current:36,placements:2,lanes:[value.lanes[0],value.lanes[1],[null,null,null,null,null,23,null]],acceptedRequestId:commands[1].requestId};
 act(changed);await flush();await act(async()=>replies[1](value));expect(h.result.current.pending).toBe(false);expect(h.result.current.snapshot?.placements).toBe(2);
});
it('a different receipt cannot unlock a pending card; an ambiguous response replays the identical UUID',async()=>{
 let value=initial(),changed!:()=>void;const commands:DropCommand[]=[];let reject!:(e:Error)=>void;
 const transport={load:async()=>value,send:(command:DropCommand)=>{commands.push(command);return new Promise<DropSnapshot>((_,r)=>{reject=r;});},subscribe:(change:()=>void,status:(v:boolean)=>void)=>{changed=change;status(true);return()=>{};}};
 const h=renderHook(()=>useDrop357('run','user',transport,true));await flush();act(()=>h.result.current.act('place',[0,0]));
 await act(async()=>reject(new Error('lost response')));expect(h.result.current.pending).toBe(true);
 value={...value,revision:2,current:23,acceptedRequestId:'another-request'};act(changed);await flush();act(()=>h.result.current.act('place',[2,5]));expect(commands).toHaveLength(1);
 act(()=>h.result.current.reconnect());await flush();expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);
});
