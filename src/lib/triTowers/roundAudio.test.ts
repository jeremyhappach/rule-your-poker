// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {triAllClearCueAt} from './allClearCue';
let h:ReturnType<typeof audioHarness>;
const ready=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();h=audioHarness();});
afterEach(()=>{h.dispose();vi.useRealTimers();vi.restoreAllMocks();});
it('uses the existing bell cue through the cancellable manager and admits a later round once',async()=>{
 await ready();
 const cue={userId:'user',id:'tri-bell:round1',startedAt:Date.now(),expiresAt:Date.now()+1800,cueAt:()=>boxingBellCue};
 const cancel=h.manager.follow(cue);expect(h.starts()).toHaveLength(8);cancel();await ready();h.manager.follow(cue);expect(h.starts()).toHaveLength(8);
 h.manager.follow({...cue,id:'tri-bell:round2'});expect(h.starts()).toHaveLength(16);
});
it('withdraws a locked bell before restoration; mute never briefly schedules it',async()=>{
 await ready();h.ctx.state='suspended';
 const cue={userId:'user',id:'tri-bell',startedAt:Date.now(),expiresAt:Date.now()+2000,cueAt:()=>boxingBellCue};
 const cancel=h.manager.follow(cue);cancel();await ready();h.state('running');expect(h.starts()).toEqual([]);
 h.manager.setPreference('user',false);h.manager.follow({...cue,id:'muted'});expect(h.starts()).toEqual([]);
});
it('seeks a late fanfare inside its existing window, then retires it without replay',async()=>{
 await ready();const cue={userId:'user',id:'tri-clear',startedAt:Date.now()-600,expiresAt:Date.now()+500,cueAt:triAllClearCueAt};
 h.manager.follow(cue);const count=h.starts().length;expect(count).toBeGreaterThan(3);expect(h.starts().every(t=>t>=10&&t<10.5)).toBe(true);
 expect(h.nodes.filter(n=>n.kind==='oscillator').every(n=>n.stop.mock.calls[0][0]<=10.5)).toBe(true);
 vi.advanceTimersByTime(500);h.manager.follow({...cue,expiresAt:Date.now()+500});expect(h.starts()).toHaveLength(count);
});
