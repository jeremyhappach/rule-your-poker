// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {TRI_FANFARE_MS,triAllClearCueAt} from './allClearCue';
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
it('plays the approved three-second harmony as two voices per rising phrase',async()=>{
 await ready();h.manager.follow({userId:'user',id:'approved-clear',startedAt:Date.now(),expiresAt:Date.now()+TRI_FANFARE_MS,cueAt:triAllClearCueAt});
 expect(h.starts()).toEqual([10,10,11,11,12,12]);
 const voices=h.nodes.filter(n=>n.kind==='oscillator');
 expect(voices[1].frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(622.253967,5);
 expect(voices[1].frequency.setValueAtTime.mock.calls[1][0]).toBeCloseTo(698.456463,5);
 expect(voices[5].frequency.setValueAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(932.327523,5);
 expect(voices.every(n=>n.setPeriodicWave.mock.calls.length===1)).toBe(true);
 expect(Math.max(...voices.map(n=>n.stop.mock.calls[0][0]))).toBeCloseTo(12.995,6);
});
it('seeks directly into the third trill without restarting its pickup or envelope',()=>{
 const cue=triAllClearCueAt(2350,650);cue.schedule(h.ctx as unknown as AudioContext,{} as AudioNode,n=>n);
 const voices=h.nodes.filter(n=>n.kind==='oscillator'),gains=h.nodes.filter(n=>n.kind==='gain');
 expect(h.starts()).toEqual([10,10]);expect(voices[1].frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(932.327523,5);
 expect(gains.every(n=>n.gain.setValueAtTime.mock.calls[0][0]>.09)).toBe(true);
 for(const voice of voices)expect(voice.stop.mock.calls[0][0]).toBeCloseTo(10.645,6);
});
it.each(['muted','background'])('retires an active fanfare on %s without replay',async mode=>{
 await ready();const cue={userId:'user',id:'retired-clear',startedAt:Date.now(),expiresAt:Date.now()+3000,cueAt:triAllClearCueAt};h.manager.follow(cue);
 if(mode==='muted')h.manager.setPreference('user',false);else h.state('suspended');
 expect(h.nodes.filter(n=>n.kind==='oscillator').every(n=>n.stop.mock.calls.length===2)).toBe(true);
 if(mode==='muted')h.manager.setPreference('user',true);else h.state('running');
 h.manager.follow(cue);expect(h.starts()).toHaveLength(6);
});
it('does not schedule an expired fanfare',()=>{
 expect(triAllClearCueAt(3000,1000).schedule(h.ctx as unknown as AudioContext,{} as AudioNode,n=>n)).toBe(false);expect(h.starts()).toEqual([]);
});
