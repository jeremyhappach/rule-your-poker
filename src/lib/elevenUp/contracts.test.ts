import {describe,it,expect,vi} from 'vitest';
import {acceptElevenSnapshot,arcadeSnapshot,multiplayerSnapshot} from './model';
import {arcadeOperation,synchronize} from '../../../server/arcade/service';
const id='12345678-1234-4234-8234-123456789012',requestId='22345678-1234-4234-8234-123456789012';
describe('11 Up boundaries',()=>{
 it('returns only the SQL projection and ignores supplied scores and state',async()=>{
  const projection={id,view:{slots:[1,null]}},rpc=vi.fn().mockResolvedValueOnce({id,game:'eleven-up'}).mockResolvedValueOnce({projection,record:{state:{board:{deck:[49]}}}});
  expect(await arcadeOperation(rpc,'owner','You',{op:'action',game:'eleven-up',runId:id,requestId,revision:7,roundId:id+':1',presentationVersion:1,intent:{type:'group',items:[1,2,3]},score:9999,state:{}})).toBe(projection);
  expect(rpc.mock.calls[1]).toEqual(['arcade_eleven_step',{p_actor:'owner',p_run:id,p_revision:7,p_round:id+':1',p_request:requestId,p_action:'group',p_items:[1,2,3]}]);
 });
 it('rejects malformed groups before calling rules authority',async()=>{
  const rpc=vi.fn().mockResolvedValue({id,game:'eleven-up'});
  await expect(arcadeOperation(rpc,'owner','You',{op:'action',runId:id,requestId,revision:7,roundId:id+':1',presentationVersion:1,intent:{type:'group',items:[1,2.2]}})).rejects.toThrow('invalid_command');expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('recovery dispatches to the same SQL step with the authorized worker token',async()=>{
  const row={id,game:'eleven-up'},rpc=vi.fn().mockResolvedValue({record:row});expect(await synchronize(rpc,row as any,null,requestId)).toBe(row);expect(rpc).toHaveBeenCalledWith('arcade_eleven_step',{p_actor:null,p_run:id,p_token:requestId});
 });
 it('rejects regressive, conflicting and foreign snapshots while allowing clock-only refresh',()=>{
  const s=arcadeSnapshot({id,revision:2,serverAt:100,status:'active',score:0,view:{roundId:id+':1',round:1,phase:'ready'}},'owner');
  expect(acceptElevenSnapshot(s,{...s,revision:1},id)).toBe(s);expect(()=>acceptElevenSnapshot(s,{...s,id:requestId},id)).toThrow('identity');expect(()=>acceptElevenSnapshot(s,{...s,round:3},id)).toThrow('conflicting');expect(acceptElevenSnapshot(s,{...s,serverAt:200},id)?.serverAt).toBe(200);
 });
 it('keeps transient server timestamps out of board semantics',()=>{
  const v={identity:{dealerGameId:id,roundId:requestId},revision:1,serverAt:100,stage:1,players:[],scores:{},stages:[],settlement:null};
  expect(()=>acceptElevenSnapshot(multiplayerSnapshot(v),multiplayerSnapshot({...v,serverAt:200}),id)).not.toThrow();
 });
});
