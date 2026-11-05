import {expect,it,vi} from 'vitest';
import {delayedOperation} from './service';
const actor='00000000-0000-4000-8000-000000000001',child='00000000-0000-4000-8000-000000000002',request='00000000-0000-4000-8000-000000000003';
it('dispatches an Async TriTowers command through one operation with verified identity',async()=>{
 const value={id:child,revision:2},rpc=vi.fn(async()=>value);
 expect(await delayedOperation(rpc,actor,{op:'action',game:'tri-towers',childId:child,requestId:request,revision:1,segment:3,intent:{type:'remove',index:18},actor:'forged'})).toBe(value);
 expect(rpc).toHaveBeenCalledExactlyOnceWith('delayed_tri_step',{p_child:child,p_actor:actor,p_request:request,p_revision:1,p_segment:3,p_intent:{type:'remove',index:18}});
});
it('keeps state reads separate from command identity',async()=>{
 const rpc=vi.fn(async()=>({id:child}));await delayedOperation(rpc,actor,{op:'state',game:'tri-towers',childId:child});
 expect(rpc).toHaveBeenCalledExactlyOnceWith('delayed_tri_step',{p_child:child,p_actor:actor});
});
it('propagates a committed deadline-recovery rejection without a second RPC',async()=>{
 const rpc=vi.fn(async()=>({error:'delayed:stale_action'}));
 await expect(delayedOperation(rpc,actor,{op:'action',game:'tri-towers',childId:child,requestId:request,revision:1,segment:3,intent:{type:'draw'}})).rejects.toThrow('delayed:stale_action');expect(rpc).toHaveBeenCalledTimes(1);
});
