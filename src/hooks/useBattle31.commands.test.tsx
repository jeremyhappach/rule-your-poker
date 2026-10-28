// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {multiplayerSnapshot} from '@/lib/battle31/model';
import {useBattle31,type Battle31Command,type Battle31Transport} from './useBattle31';
const snapshot=()=>multiplayerSnapshot({identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},revision:1,serverAt:1000,dealId:'deal',stage:1,stake:5,viewerId:'a',rules:{version:'battle-31/1',turnMs:30000,introMs:1800,holdMs:8000},phase:'playing',deadline:31000,turn:1,closing:false,hands:[[0,1,10],[null,null,null]],center:[2,11,20],values:[15,null],losses:[0,0],event:{label:'Turn'},result:null,canAct:true,paused:false,finished:false,settlement:null,players:[{id:'a',name:'A',seat:2,chips:100},{id:'b',name:'B',seat:6,chips:100}],results:[],activePlayerId:'a'});
afterEach(()=>{cleanup();sessionStorage.clear();});
it('retries one immutable card-ID command after an uncertain response and blocks additional selections',async()=>{
 const v=snapshot(),seen:Battle31Command[]=[];
 const transport:Battle31Transport={load:async()=>v,subscribe:(_refresh,status)=>{status(true);return()=>{};},send:vi.fn(async c=>{seen.push(c);if(seen.length===1)throw Error('Connection uncertain. Reconnect to retry.');return {...v,revision:2,canAct:false};})};
 const h=renderHook(()=>useBattle31('d','a',transport));await waitFor(()=>expect(h.result.current.snapshot).not.toBeNull());
 await act(()=>h.result.current.act({type:'swap',items:[0,2]},{scope:'deal',revision:1}));expect(h.result.current.pending).toBe(true);
 await act(()=>h.result.current.act({type:'swap',items:[1,11]}));expect(seen).toHaveLength(1);
 act(()=>h.result.current.reconnect());await waitFor(()=>expect(h.result.current.pending).toBe(false));expect(seen).toHaveLength(2);expect(seen[1]).toEqual(seen[0]);expect(seen[1].requestId).toBeTruthy();
});
it('rejects rebased selections, invalid card IDs and off-turn input before creating a command',async()=>{
 const v=snapshot(),send=vi.fn(async()=>v),transport:Battle31Transport={load:async()=>v,send,subscribe:(_refresh,status)=>{status(true);return()=>{};}};
 const h=renderHook(()=>useBattle31('d','a',transport));await waitFor(()=>expect(h.result.current.snapshot).not.toBeNull());
 await act(()=>h.result.current.act({type:'swap',items:[0,2]},{scope:'deal',revision:0}));
 await act(()=>h.result.current.act({type:'swap',items:[0,2]},{scope:'retired',revision:1}));
 await act(()=>h.result.current.act({type:'swap',items:[16,2]}));expect(send).not.toHaveBeenCalled();expect(sessionStorage.length).toBe(0);
 v.canAct=false;await act(()=>h.result.current.act({type:'swap',items:[0,2]}));expect(send).not.toHaveBeenCalled();
});
