import {describe,it,expect,vi} from 'vitest';
import {arcadeOperation,synchronize} from '../../../server/arcade/service';
const id='12345678-1234-4234-8234-123456789012',request='22345678-1234-4234-8234-123456789012';
describe('Solo TriTowers dispatch',()=>{
 it('returns only the SQL redacted projection and ignores browser-supplied state/score',async()=>{
  const projection={id,game:'tri-towers',view:{cards:[null,12]}};
  const rpc=vi.fn().mockResolvedValueOnce({id,game:'tri-towers'}).mockResolvedValueOnce({outcome:'committed',record:{state:{board:{deck:[42]}}},projection});
  expect(await arcadeOperation(rpc,'owner','You',{op:'action',runId:id,revision:1,roundId:id+':1',requestId:request,intent:{type:'draw'},score:99999,state:{}})).toBe(projection);
  expect(rpc.mock.calls[1]).toEqual(['arcade_tri_step',{p_actor:'owner',p_run:id,p_revision:1,p_round:id+':1',p_request:request,p_action:'draw',p_index:null}]);
 });
 it('rejects noninteger removal indexes before board authority',async()=>{
  const rpc=vi.fn().mockResolvedValue({id,game:'tri-towers'});
  await expect(arcadeOperation(rpc,'owner','You',{op:'action',runId:id,revision:1,roundId:id+':1',requestId:request,intent:{type:'remove',index:1.5}})).rejects.toThrow('invalid_command');expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('worker dispatches to the same SQL authority with its claim token',async()=>{
  const row={id,game:'tri-towers'},rpc=vi.fn().mockResolvedValue({record:row});
  expect(await synchronize(rpc,row as any,null,request)).toBe(row);expect(rpc).toHaveBeenCalledWith('arcade_tri_step',{p_actor:null,p_run:id,p_token:request});
 });
});
