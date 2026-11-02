// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn(async()=>({error:null}))}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import {setActivityUser,getAppInteractionAgeMs} from './appActivity';
afterEach(()=>{setActivityUser(null);vi.restoreAllMocks();rpc.mockClear();});
it('tracks visible app entry and foreground return with throttling, never token refresh or hidden activity',async()=>{
 let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false);
 setActivityUser('one');setActivityUser('one');window.dispatchEvent(new Event('focus'));expect(rpc).toHaveBeenCalledTimes(1);
 now+=61000;hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));expect(rpc).toHaveBeenCalledTimes(1);
 hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));expect(rpc).toHaveBeenCalledTimes(2);
 setActivityUser(null);now+=61000;window.dispatchEvent(new Event('focus'));expect(rpc).toHaveBeenCalledTimes(2);
 expect(rpc).toHaveBeenCalledWith('record_app_activity');
});
it('tracks local interaction independently of throttled profile writes and isolates accounts',()=>{
 let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false);
 const events=vi.spyOn(document,'addEventListener');
 setActivityUser('one');now+=30000;
 const gesture=events.mock.calls.find(([name])=>name==='pointerdown')![1] as EventListener;
 gesture({isTrusted:false} as Event);
 expect(getAppInteractionAgeMs('one')).toBe(30000);
 gesture({isTrusted:true} as Event);
 expect(getAppInteractionAgeMs('one')).toBe(0);
 expect(rpc).toHaveBeenCalledTimes(1);
 now+=61000;expect(getAppInteractionAgeMs('one')).toBe(61000);
 hidden.mockReturnValue(true);expect(getAppInteractionAgeMs('one')).toBeNull();
 hidden.mockReturnValue(false);expect(getAppInteractionAgeMs('two')).toBeNull();
 setActivityUser(null);expect(getAppInteractionAgeMs('one')).toBeNull();
});
