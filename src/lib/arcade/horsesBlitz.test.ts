import {describe,it,expect,vi} from 'vitest';
import {arcadeOperation} from '../../../server/arcade/service';
const actor='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333';
const command=(intent:unknown)=>({game:'horses-blitz',op:'action',runId:run,requestId:request,revision:2,roundId:run+':1',intent});
describe('Horses Blitz authenticated dispatch',()=>{
 it.each([{type:'roll',items:[0,0]},{type:'roll',items:[-1]},{type:'roll',items:[5]},{type:'roll',items:[1.5]},{type:'bank',items:[0]},{type:'next_round',items:[1]},{type:'score',items:[]},{type:'roll',items:null}])('rejects malformed command %j before RPC',async intent=>{const rpc=vi.fn();await expect(arcadeOperation(rpc,actor,'Player',command(intent))).rejects.toThrow('invalid_command');expect(rpc).not.toHaveBeenCalled();});
 it('sends only owner, exact revision, round, UUID and held indices to authority',async()=>{const projection={id:run,revision:3,score:225};const rpc=vi.fn().mockResolvedValue({outcome:'committed',projection});expect(await arcadeOperation(rpc,actor,'Player',{...command({type:'roll',items:[0,1,2]}),score:99999})).toEqual(projection);expect(rpc).toHaveBeenCalledWith('arcade_horses_blitz_step',{p_actor:actor,p_run:run,p_revision:2,p_round:run+':1',p_request:request,p_action:'roll',p_items:[0,1,2]});});
 it('rejects a stale response so the client must restore authority',async()=>{await expect(arcadeOperation(vi.fn().mockResolvedValue({outcome:'stale'}),actor,'Player',command({type:'bank',items:[]}))).rejects.toThrow('stale_action');});
});
