// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {audioHarness} from './audioTestHarness';
import {scoreCountCue} from '../run21/scoreCountCue';
let h:ReturnType<typeof audioHarness>;
const ready=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const event=(id='score')=>({userId:'user',id,startedAt:Date.now(),expiresAt:Date.now()+1000,cueAt:(at:number,left:number)=>scoreCountCue(0,100,at,left)});
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();h=audioHarness();});
afterEach(()=>{h.dispose();vi.useRealTimers();vi.restoreAllMocks();});
it('one synchronized source sequence survives effect rehearsal, then cancels on real unmount',async()=>{
 await ready();const cue=event(),one=h.manager.follow(cue);one();const two=h.manager.follow(cue);await ready();
 expect(h.starts().length).toBeGreaterThan(0);const count=h.starts().length;
 expect(h.starts().every(t=>t>=10&&t<11)).toBe(true);
 two();await ready();expect(h.nodes.every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
 h.manager.follow(cue);expect(h.starts()).toHaveLength(count);
});
it('late unlock skips elapsed ticks and never extends the presentation',async()=>{
 await ready();h.ctx.state='suspended';h.manager.follow(event());vi.advanceTimersByTime(550);h.state('running');
 expect(h.starts().length).toBeGreaterThan(0);
 expect(h.starts().every(t=>t>=10&&t<10.45)).toBe(true);
 vi.advanceTimersByTime(450);expect(h.nodes.every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
});
it.each(['muted','hidden','interrupted'])('retires scheduled and pending counters on %s with no late playback',async(mode)=>{
 await ready();const cue=event();h.manager.follow(cue);const count=h.starts().length;
 if(mode==='muted')h.manager.setPreference('user',false);
 if(mode==='hidden'){vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));}
 if(mode==='interrupted')h.state('interrupted');
 expect(h.nodes.every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
 if(mode==='hidden')vi.spyOn(document,'hidden','get').mockReturnValue(false);h.ctx.state='running';h.manager.setPreference('user',true);h.manager.follow(cue);
 expect(h.starts()).toHaveLength(count);
});
it('withdrawn or expired locked cues never play after preference/unlock',async()=>{
 h.dispose();let resolve!:(value:boolean)=>void;h=audioHarness(()=>new Promise(r=>{resolve=r;}));
 const cancel=h.manager.follow(event());cancel();await ready();resolve(true);await ready();expect(h.starts()).toEqual([]);
 h.ctx.state='suspended';h.manager.follow(event('next'));vi.advanceTimersByTime(1001);h.state('running');expect(h.starts()).toEqual([]);
});
it('does not synthesize an unchanged score',async()=>{
 await ready();h.manager.follow({...event(),cueAt:(at,left)=>scoreCountCue(7,7,at,left)});expect(h.starts()).toEqual([]);
});
