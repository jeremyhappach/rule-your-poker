// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,renderHook,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc,auth:{getSession:mocks.getSession,onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}));
import {usePtownWordsAccess} from './usePtownWordsAccess';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it.each([{}, {version:2},{enabled:false},{user_id:'other'},{session_id:'other'},{fake_money_only:false}])('requires the matching fake-only release capability %j',async patch=>{
 mocks.getSession.mockResolvedValue({data:{session:{user:{id:'user'}}}});
 mocks.rpc.mockResolvedValue({data:{version:3,enabled:true,user_id:'user',session_id:'session',fake_money_only:true,...patch},error:null});
 const {result}=renderHook(()=>usePtownWordsAccess('session'));await waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());
 if(Object.keys(patch).length===0)await waitFor(()=>expect(result.current).toBe(true));else expect(result.current).toBe(false);
});
it.each([
 [{version:4,fake_money_only:false},true],
 [{version:4,fake_money_only:false,enabled:false},false],
 [{version:4,fake_money_only:true},false],
 [{version:4,fake_money_only:false,user_id:'other'},false],
 [{version:4,fake_money_only:false,session_id:'other'},false],
] as const)('respects versioned live-money authority %j',async(patch,allowed)=>{
 mocks.getSession.mockResolvedValue({data:{session:{user:{id:'user'}}}});
 mocks.rpc.mockResolvedValue({data:{enabled:true,user_id:'user',session_id:'session',...patch},error:null});
 const {result}=renderHook(()=>usePtownWordsAccess('session'));await waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());
 if(allowed)await waitFor(()=>expect(result.current).toBe(true));else expect(result.current).toBe(false);
});
