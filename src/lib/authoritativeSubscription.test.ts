// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from './authoritativeSubscription';
const disposals:Array<()=>void>=[];
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{disposals.splice(0).forEach(f=>f());vi.useRealTimers();});
function fixture(load=vi.fn(async()=>1)){
 const channels:Array<{changed:()=>void;status:(v:boolean)=>void;stop:ReturnType<typeof vi.fn>}>=[];
 const connected=vi.fn(),apply=vi.fn(()=>true),error=vi.fn(),interrupt=vi.fn();
 const subscription=createAuthoritativeSubscription({load,apply,connected,error,interrupt,subscribe:(changed,status)=>{const stop=vi.fn();channels.push({changed,status,stop});return stop;}});
 disposals.push(subscription.dispose);return {subscription,channels,load,connected,apply,error,interrupt};
}
it('closes the pre-ACK read race with a second read before admitting actions',async()=>{
 let finish!:(v:number)=>void;const load=vi.fn(()=>new Promise<number>(r=>finish=r)),f=fixture(load);
 f.channels[0].status(true);await flush();finish(1);await flush();expect(load).toHaveBeenCalledTimes(2);expect(f.connected).not.toHaveBeenCalledWith(true);
 finish(2);await flush();expect(f.connected).toHaveBeenLastCalledWith(true);expect(f.apply.mock.calls).toEqual([[1,false],[2,false]]);
});
it('repairs missing ACK with bounded rebinds and ignores retired channel callbacks',async()=>{
 const f=fixture();await flush();expect(f.connected).not.toHaveBeenCalledWith(true);
 await vi.advanceTimersByTimeAsync(6000);expect(f.channels).toHaveLength(2);expect(f.channels[0].stop).toHaveBeenCalledTimes(1);
 f.channels[0].status(true);f.channels[0].changed();await flush();expect(f.connected).not.toHaveBeenCalledWith(true);
 f.channels[1].status(true);await flush();expect(f.connected).toHaveBeenLastCalledWith(true);
});
it('keeps recovery blocked while a revision observed during a read still needs catch-up',async()=>{
 let finish!:(v:number)=>void;const f=fixture(vi.fn(()=>new Promise<number>(r=>finish=r)));
 f.channels[0].status(true);await flush();finish(1);await flush();
 f.channels[0].changed();finish(2);await flush();expect(f.subscription.isReady()).toBe(false);expect(f.connected).not.toHaveBeenCalledWith(true);
 finish(3);await flush();expect(f.subscription.isReady()).toBe(true);
});
it('late command acknowledgement cannot delete a newer durable intent',()=>{
 sessionStorage.setItem('intent','request-B');retireAcknowledgedCommand('intent','request-A');expect(sessionStorage.getItem('intent')).toBe('request-B');
 retireAcknowledgedCommand('intent','request-B');expect(sessionStorage.getItem('intent')).toBeNull();
});
it('exhausts finite retries, then allows explicit recovery',async()=>{
 const f=fixture();await vi.advanceTimersByTimeAsync(30000);expect(f.channels).toHaveLength(3);
 await f.subscription.recover();expect(f.channels).toHaveLength(4);f.channels[3].status(true);await flush();expect(f.connected).toHaveBeenLastCalledWith(true);
});
it('requires a new ACK and snapshot after offline/online and ignores late reads after disposal',async()=>{
 const f=fixture();f.channels[0].status(true);await flush();
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));expect(f.connected).toHaveBeenLastCalledWith(false);
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));await flush();expect(f.channels).toHaveLength(2);expect(f.connected).toHaveBeenLastCalledWith(false);
 f.channels[1].status(true);await flush();expect(f.connected).toHaveBeenLastCalledWith(true);
 let finish!:(v:number)=>void;f.load.mockImplementation(()=>new Promise(r=>finish=r));f.channels[1].changed();await flush();const count=f.apply.mock.calls.length;f.subscription.dispose();finish(4);await flush();expect(f.apply).toHaveBeenCalledTimes(count);
});
it('does not bless a rejected/regressive snapshot as recovered',async()=>{
 const f=fixture();await flush();f.apply.mockReturnValue(false);f.channels[0].status(true);await flush();expect(f.connected).not.toHaveBeenCalledWith(true);expect(f.error).toHaveBeenCalled();
});
it('recovers a timed-out read without accepting its late completion',async()=>{
 let finish!:(v:number)=>void;const f=fixture(vi.fn(()=>new Promise<number>(r=>finish=r)));f.channels[0].status(true);
 await vi.advanceTimersByTimeAsync(10000);expect(f.error).toHaveBeenCalled();finish(99);await flush();expect(f.apply).not.toHaveBeenCalled();
 f.load.mockResolvedValue(2);await vi.advanceTimersByTimeAsync(1000);expect(f.apply).toHaveBeenLastCalledWith(2,true);expect(f.connected).toHaveBeenLastCalledWith(true);
});
it('performs only three reads at a persisted boundary and cancels old identity timers',async()=>{
 const refresh=vi.fn(),cancel=scheduleAuthoritativeBoundary(1000,refresh);await vi.advanceTimersByTimeAsync(2000);expect(refresh).toHaveBeenCalledTimes(2);cancel();await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledTimes(2);
 const again=vi.fn();scheduleAuthoritativeBoundary(0,again);await vi.advanceTimersByTimeAsync(100000);expect(again).toHaveBeenCalledTimes(3);
});
