import {expect,it,vi} from 'vitest';
import {arcadeOperation,triShortcut} from '../../../server/arcade/service';
const actor='00000000-0000-4000-8000-000000000001',run='00000000-0000-4000-8000-000000000002',request='00000000-0000-4000-8000-000000000003';
const body={op:'action',game:'tri-towers',presentationVersion:4,runId:run,requestId:request,revision:7,roundId:'round',intent:{type:'draw'}};
it('uses only the locked authoritative step with the verified actor and unchanged command fingerprint',async()=>{
 const rpc=vi.fn(async()=>({outcome:'committed',projection:{revision:8}}));expect(await arcadeOperation(rpc,actor,'unused',body)).toEqual({revision:8});expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('arcade_tri_step',{p_actor:actor,p_run:run,p_revision:7,p_round:'round',p_request:request,p_action:'draw',p_index:null});
});
it.each(['arcade:forbidden','arcade:not_found','arcade:request_conflict','arcade:round_intro'])('retains authoritative rejection %s',async message=>{
 await expect(arcadeOperation(async()=>{throw Error(message);},actor,'unused',body)).rejects.toThrow(message);
});
it('retains stale, duplicate and presentation-version behavior',async()=>{
 await expect(arcadeOperation(async()=>({outcome:'stale'}),actor,'',body)).rejects.toThrow('arcade:stale_action');
 expect(await arcadeOperation(async()=>({outcome:'duplicate',projection:{revision:9}}),actor,'',body)).toEqual({revision:9});
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({id:run,game:'tri-towers',ruleset:'tri-towers/3'}));await expect(arcadeOperation(rpc,actor,'',{...body,presentationVersion:2})).rejects.toThrow('arcade:refresh_required');expect(rpc.mock.calls[0][0]).toBe('arcade_load');
});
it('keeps malformed requests and non-TriTowers routing on their existing path',()=>{
 expect(triShortcut({...body,requestId:'bad'})).toBeFalsy();expect(triShortcut({...body,game:'run21'})).toBeFalsy();expect(triShortcut({...body,presentationVersion:2})).toBeFalsy();
});
it.each(['tri-towers/4','tri-towers/5'])('rejects a v3 client before a %s action, while its frozen v3 game remains available',async ruleset=>{
 const rpc=vi.fn(async(name:string)=>name==='arcade_load'?{id:run,game:'tri-towers',ruleset}:{projection:{revision:8}});
 await expect(arcadeOperation(rpc,actor,'',{...body,presentationVersion:3})).rejects.toThrow('arcade:refresh_required');expect(rpc).toHaveBeenCalledTimes(1);
 rpc.mockImplementation(async(name:string)=>name==='arcade_load'?{id:run,game:'tri-towers',ruleset:'tri-towers/3'}:{projection:{revision:8}});
 expect(await arcadeOperation(rpc,actor,'',{...body,presentationVersion:3})).toEqual({revision:8});
});
