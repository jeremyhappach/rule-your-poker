// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,renderHook,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession,onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}));
import {useBattle31Access} from './useBattle31Access';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it.each([true,false])('accepts qualified session response with fake_money_only=%s',async(fakeOnly)=>{
 mocks.getSession.mockResolvedValue({data:{session:{user:{id:'user'}}}});
 mocks.rpc.mockResolvedValue({data:{version:3,enabled:true,user_id:'user',session_id:'session',fake_money_only:fakeOnly},error:null});
 const {result}=renderHook(()=>useBattle31Access('session'));
 await waitFor(()=>expect(result.current).toBe(true));
 expect(mocks.rpc).toHaveBeenCalledWith('battle31_capabilities',{p_session_id:'session'});
});
it.each([{version:2},{enabled:false},{user_id:'other'},{session_id:'other'},{fake_money_only:null}])('fails closed for incompatible or unauthorized response %j',async(patch)=>{
 mocks.getSession.mockResolvedValue({data:{session:{user:{id:'user'}}}});
 mocks.rpc.mockResolvedValue({data:{version:3,enabled:true,user_id:'user',session_id:'session',fake_money_only:true,...patch},error:null});
 const {result}=renderHook(()=>useBattle31Access('session'));
 await waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());
 expect(result.current).toBe(false);
});
