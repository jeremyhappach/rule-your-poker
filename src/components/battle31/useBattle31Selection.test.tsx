// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {multiplayerSnapshot} from '@/lib/battle31/model';
import {useBattle31Selection} from './useBattle31Selection';
const snapshot=()=>multiplayerSnapshot({identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},revision:1,serverAt:1000,dealId:'deal',stage:1,stake:5,viewerId:'a',rules:{version:'battle-31/1',turnMs:30000,introMs:1800,holdMs:8000},phase:'playing',deadline:31000,turn:1,closing:false,hands:[[0,1,10],[null,null,null]],center:[2,11,20],values:[15,null],losses:[0,0],event:{label:'Turn'},result:null,canAct:true,paused:false,finished:false,settlement:null,players:[{id:'a',name:'A',seat:2,chips:100},{id:'b',name:'B',seat:6,chips:100}],results:[],activePlayerId:'a'});
afterEach(cleanup);
it.each(['own','center'] as const)('automatically submits once with %s selected first, even for rapid repeat clicks',first=>{
 const send=vi.fn(),v=snapshot(),h=renderHook(()=>useBattle31Selection(v,0,true,send));
 act(()=>h.result.current.pick(first,first==='own'?0:2));expect(send).not.toHaveBeenCalled();
 act(()=>{h.result.current.pick(first==='own'?'center':'own',first==='own'?2:0);h.result.current.pick('own',1);h.result.current.pick('center',11);});
 expect(send).toHaveBeenCalledExactlyOnceWith({type:'swap',items:[0,2]},{scope:'deal',revision:1});expect(h.result.current.selected).toBeNull();
});
it('clears selection at revision, reconnect, turn loss and successor identity boundaries',()=>{
 const send=vi.fn(),props={v:snapshot(),epoch:0,active:true},h=renderHook(({v,epoch,active})=>useBattle31Selection(v,epoch,active,send),{initialProps:props});
 for(const next of [{...props,v:{...props.v,revision:2}},{...props,epoch:1},{...props,active:false},{...props,v:{...props.v,id:'successor',scope:'new-deal'}}]){
  h.rerender(props);act(()=>h.result.current.pick('own',0));h.rerender(next);expect(h.result.current.selected).toBeNull();act(()=>h.result.current.pick('center',2));expect(send).not.toHaveBeenCalled();
 }
});
it('rejects hidden, missing and stale IDs and allows a new exchange on a new revision',()=>{
 const send=vi.fn(),v=snapshot(),h=renderHook(({v,active})=>useBattle31Selection(v,0,active,send),{initialProps:{v,active:false}});
 act(()=>{h.result.current.pick('own',0);h.result.current.pick('center',2);});expect(send).not.toHaveBeenCalled();
 h.rerender({v,active:true});act(()=>{h.result.current.pick('own',16);h.result.current.pick('center',99);});expect(h.result.current.selected).toBeNull();
 act(()=>{h.result.current.pick('own',0);h.result.current.pick('center',2);});
 const next={...v,revision:3,board:{...v.board,hands:[[2,1,10],[null,null,null]],center:[0,11,20]}};
 h.rerender({v:next,active:true});act(()=>{h.result.current.pick('center',2);h.result.current.pick('own',0);});expect(send).toHaveBeenCalledTimes(1);
 act(()=>{h.result.current.pick('center',0);h.result.current.pick('own',2);});expect(send).toHaveBeenCalledTimes(2);
});
