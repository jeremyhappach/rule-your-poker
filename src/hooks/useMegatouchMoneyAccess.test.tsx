// @vitest-environment jsdom
import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:auth.rpc,auth:{getSession:auth.getSession,onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}}}));
import {useTriTowersTestAccess} from './useTriTowersTestAccess';
import {useElevenUpAccess} from './useElevenUpAccess';
import {useRoyalFlashAccess} from './useRoyalFlashAccess';
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const capability={version:2,enabled:true,fake_money_only:false,user_id:user,session_id:session};
beforeEach(()=>{vi.clearAllMocks();auth.getSession.mockResolvedValue({data:{session:{user:{id:user}}}});});
afterEach(cleanup);
describe.each([['tri_towers',useTriTowersTestAccess],['eleven_up',useElevenUpAccess],['royal_flash',useRoyalFlashAccess]] as const)('%s normal admission',(name,useAccess)=>{
 it('requires the matching normal-money capability',async()=>{
  auth.rpc.mockResolvedValue({data:capability,error:null});
  const {result}=renderHook(()=>useAccess(session));await waitFor(()=>expect(result.current).toBe(true));
  expect(auth.rpc).toHaveBeenCalledWith(name+'_capabilities',{p_session_id:session});
 });
 it.each([{version:1,fake_money_only:true},{enabled:false},{user_id:'other'},{session_id:'other'},{fake_money_only:true}])('rejects a stale, closed or mismatched capability %j',async(change)=>{
  auth.rpc.mockResolvedValue({data:{...capability,...change},error:null});
  const {result}=renderHook(()=>useAccess(session));await waitFor(()=>expect(auth.rpc).toHaveBeenCalledOnce());expect(result.current).toBe(false);
 });
});
