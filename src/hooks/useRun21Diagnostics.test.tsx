// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({id:'account'}));
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,auth:{getSession:async()=>({data:{session:{user:{id:auth.id}}}})}}}));
import {useRun21Diagnostics} from './useRun21Diagnostics';
import {run21Timing} from '@/lib/run21/diagnostics';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();auth.id='account';});
it.each(['arcade','multiplayer'] as const)('automatically enables %s without flags and does not resubscribe on renders',async(mode)=>{
 vi.useFakeTimers();const calls:{name:string;args:any}[]=[];
 rpc.mockImplementation((name,args)=>({abortSignal:async()=>{calls.push({name,args});return{data:name==='run21_timing_grant'?{serverNow:Date.now(),expiresAt:Date.now()+120000}:true,error:null};}}));
 const hook=renderHook(()=>useRun21Diagnostics('account',mode,'game'));
 await act(async()=>{});run21Timing('intent','command');hook.rerender();hook.rerender();
 expect(calls.map(c=>c.name)).toEqual(['run21_timing_grant']);
 await act(()=>vi.advanceTimersByTimeAsync(30010));
 expect(calls[1].args.p_mode).toBe(mode);expect(calls[1].args.p_samples.some((s:any)=>s[2]==='intent')).toBe(true);
 // A logout/account change during a final idle upload cannot upload old evidence.
 auth.id='another-account';hook.unmount();await act(()=>vi.advanceTimersByTimeAsync(10000));
 expect(calls).toHaveLength(2);expect(vi.getTimerCount()).toBe(0);
});
it('does no capture work for an account without a grant',async()=>{
 vi.useFakeTimers();rpc.mockReturnValue({abortSignal:async()=>({data:null,error:null})});
 const hook=renderHook(()=>useRun21Diagnostics('other','arcade','game'));await act(async()=>{});
 await act(()=>vi.advanceTimersByTimeAsync(90000));expect(rpc).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);hook.unmount();
});
