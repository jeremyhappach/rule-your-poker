import {expect,it,vi} from 'vitest';
import {arcadeOperation,takeTwoShortcut} from '../../../server/arcade/service';
const actor='00000000-0000-4000-8000-000000000001',run='00000000-0000-4000-8000-000000000002',request='00000000-0000-4000-8000-000000000003';
const body={op:'action',game:'take-two',presentationVersion:1,runId:run,requestId:request,revision:7,roundId:'round',intent:{type:'pair',items:[-1,27]}};
it('uses one authoritative call with the exact actor, revision, round, UUID and pair',async()=>{
 const rpc=vi.fn(async()=>({outcome:'committed',projection:{revision:8}}));expect(await arcadeOperation(rpc,actor,'unused',body)).toEqual({revision:8});expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('arcade_take_two_step',{p_actor:actor,p_run:run,p_revision:7,p_round:'round',p_request:request,p_action:'pair',p_items:[-1,27]});
});
it.each(['arcade:forbidden','arcade:not_found','arcade:request_conflict','arcade:round_intro','arcade:illegal_pair'])('preserves authoritative rejection %s',async message=>{
 await expect(arcadeOperation(async()=>{throw Error(message);},actor,'unused',body)).rejects.toThrow(message);
});
it('retains stale and duplicate behavior without changing the request',async()=>{
 await expect(arcadeOperation(async()=>({outcome:'stale'}),actor,'',body)).rejects.toThrow('arcade:stale_action');
 expect(await arcadeOperation(async()=>({outcome:'duplicate',projection:{revision:9}}),actor,'',body)).toEqual({revision:9});
});
it('rejects malformed pairs and old presentation versions before any step',async()=>{
 for(const items of [[1],[1,2,3],[-2,1],[1,33],[1,1.5],null]){
  const invalid={...body,intent:{type:'pair',items}};expect(takeTwoShortcut(invalid)).toBeFalsy();
  const rpc=vi.fn(async()=>({id:run,game:'take-two'}));await expect(arcadeOperation(rpc,actor,'',invalid)).rejects.toThrow('arcade:invalid_command');expect(rpc).toHaveBeenCalledTimes(1);
 }
 const rpc=vi.fn(async()=>({id:run,game:'take-two'}));await expect(arcadeOperation(rpc,actor,'',{...body,presentationVersion:0})).rejects.toThrow('arcade:refresh_required');expect(rpc).toHaveBeenCalledTimes(1);
 expect(takeTwoShortcut({...body,game:'run21'})).toBe(false);
});
