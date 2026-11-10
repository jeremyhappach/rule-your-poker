import {expect,it,vi} from 'vitest';
import {delayedOperation} from '../../../server/delayed/service';
import {project,type Child} from '../../../server/delayed/adapter';
import {admitTurnSnapshot} from './turnSnapshot';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',child='20000000-0000-4000-8000-000000000001',request='30000000-0000-4000-8000-000000000001';
const record=(choice:'pending'|'play'|'skip'):Child=>({id:child,match_id:'match',game_type:'tri-towers',config:{},starter:a,actor:a,segment:5,revision:10,terminal:choice==='skip',available_at:'2026-11-10T00:00:00Z',expires_at:'2026-11-11T12:00:00Z',server_at:1000,organizer:a,opponent:b,state:{version:'delayed/1',game:'tri-towers',child,players:[a,b],round:3,turn:0,totals:{[a]:100000,[b]:1000},attempts:[],board:null,deck:null,completed:choice==='skip',winner:choice==='skip'?a:null,segmentStartedAt:null,optionalBonus:{actor:a,choice}}});
it.each(['tri-towers','quintzee','boxdrop'])('routes %s choices to shared service authority before optimized gameplay dispatch',async game=>{
 for(const choice of ['play','skip'] as const){const rpc=vi.fn().mockResolvedValueOnce({...record(choice),game_type:game});
  if(game==='tri-towers')rpc.mockResolvedValueOnce(await project(record(choice),a,vi.fn()));
  const result=await delayedOperation(rpc,a,{op:'action',childId:child,requestId:request,revision:9,segment:5,game,intent:{type:'bonus_'+choice}});
  expect(rpc).toHaveBeenNthCalledWith(1,'delayed_bonus_choice',{p_child:child,p_actor:a,p_request:request,p_revision:9,p_segment:5,p_choice:choice});
  expect(rpc).toHaveBeenCalledTimes(game==='tri-towers'?2:1);
  if(game==='tri-towers')expect(rpc).toHaveBeenLastCalledWith('delayed_tri_bonus_step',{p_child:child,p_actor:a});
  expect(result.optionalBonus).toEqual({actor:a,choice});expect(result.terminal).toBe(choice==='skip');
 }
});
it('reconstructs a pending choice after reconnect and preserves old snapshot shape before eligibility',async()=>{
 const row=record('pending'),rpc=vi.fn(),first=await project(row,a,rpc),reconnect=await project(structuredClone(row),a,rpc);
 expect(admitTurnSnapshot(first,reconnect)).toBe(true);expect(reconnect.optionalBonus).toEqual({actor:a,choice:'pending'});
 expect(await project(row,b,rpc)).not.toHaveProperty('optionalBonus');
 delete row.state!.optionalBonus;expect(await project(row,a,rpc)).not.toHaveProperty('optionalBonus');
});
it('propagates authorization failure without falling through to gameplay',async()=>{
 const rpc=vi.fn().mockRejectedValue(Error('bonus:not_eligible'));
 await expect(delayedOperation(rpc,b,{op:'action',childId:child,requestId:request,revision:9,segment:5,game:'tri-towers',intent:{type:'bonus_skip'}})).rejects.toThrow('bonus:not_eligible');expect(rpc).toHaveBeenCalledOnce();
});
