import {describe,it,expect,vi} from 'vitest';
import {arcadeOperation} from '../../../server/arcade/service';
const actor='10000000-0000-4000-8000-000000000001',runId='20000000-0000-4000-8000-000000000002',requestId='30000000-0000-4000-8000-000000000003';
const command={op:'action',game:'ship-cap-voyage',runId,requestId,revision:7,roundId:runId+':2',intent:{type:'roll',items:[]}};
describe('Ship Cap Voyage authority boundary',()=>{
 it.each(['roll','bank','next_round','abandon'])('passes only %s intent and verified actor to the existing receipt owner',async type=>{
  const rpc=vi.fn().mockResolvedValue({outcome:'committed',projection:{score:123}});
  expect(await arcadeOperation(rpc,actor,'You',{...command,intent:{type,items:[]},userId:'forged',score:999999,dice:[6,5,4,6,6]})).toEqual({score:123});
  expect(rpc).toHaveBeenCalledExactlyOnceWith('arcade_ship_cap_voyage_step',{p_actor:actor,p_run:runId,p_revision:7,p_round:runId+':2',p_request:requestId,p_action:type,p_items:[]});
 });
 it.each([{type:'roll',items:[0]},{type:'bank',items:[12]},{type:'auto_roll',items:[]},{type:'roll',items:null}])('rejects unsupported holds and actions: %j',async intent=>{
  const rpc=vi.fn();await expect(arcadeOperation(rpc,actor,'You',{...command,intent})).rejects.toThrow('invalid_command');expect(rpc).not.toHaveBeenCalled();
 });
 it('reports stale state instead of treating it as an accepted move',async()=>{
  const rpc=vi.fn().mockResolvedValue({outcome:'stale',projection:{}});await expect(arcadeOperation(rpc,actor,'You',command)).rejects.toThrow('stale_action');
 });
 it('state refresh sends no gameplay command',async()=>{
  const rpc=vi.fn().mockResolvedValue({outcome:'current',projection:{}});await arcadeOperation(rpc,actor,'You',{game:'ship-cap-voyage',op:'state',runId});expect(rpc).toHaveBeenCalledExactlyOnceWith('arcade_ship_cap_voyage_step',{p_actor:actor,p_run:runId});
 });
});
