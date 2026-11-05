// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {audioTrace,AUDIO_TRACE_LIMIT,AUDIO_TRACE_MS} from './audioTrace';
import {audioHarness} from './audioTestHarness';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {quintzeeHoldCue} from './quintzeeHoldCue';
let h:ReturnType<typeof audioHarness>|undefined;
async function ready(){for(let i=0;i<6;i++)await Promise.resolve();}
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();audioTrace.clear();});
afterEach(()=>{h?.dispose();h=undefined;audioTrace.clear();vi.useRealTimers();});
it('defaults off, bounds capture, survives storage and expires automatically',async()=>{
 audioTrace.record('ignored');expect(audioTrace.export()).toBe('null');audioTrace.start();
 for(let i=0;i<AUDIO_TRACE_LIMIT+5;i++)audioTrace.record('event',{i});
 expect(JSON.parse(audioTrace.export()).entries).toHaveLength(AUDIO_TRACE_LIMIT);expect(audioTrace.getSnapshot().active).toBe(false);
 expect(localStorage.getItem('ptown:audio-trace:v1')).toContain('event-limit');
 audioTrace.start();vi.advanceTimersByTime(AUDIO_TRACE_MS);expect(audioTrace.getSnapshot().active).toBe(false);expect(JSON.parse(audioTrace.export()).stopped).toBe('expired');
});
it('captures readiness, remaining window, scheduling and owner cancellation without changing bell output',async()=>{
 audioTrace.start();h=audioHarness();await ready();h.ctx.state='suspended';
 const release=h.manager.follow({userId:'user',id:'run21-bell:tri:round',startedAt:Date.now(),expiresAt:Date.now()+2500,cueAt:()=>boxingBellCue});
 expect(h.starts()).toHaveLength(0);h.state('running');expect(h.starts()).toHaveLength(8);release();await Promise.resolve();
 const entries=JSON.parse(audioTrace.export()).entries;
 expect(entries).toEqual(expect.arrayContaining([expect.objectContaining({event:'schedule-not-ready',contextState:'suspended'}),expect.objectContaining({event:'sources-scheduled',durationMs:970,remainingMs:2500}),expect.objectContaining({event:'timeline-retired',reason:'owner-released'})]));
});
it('records the short-window rejection and mute without enabling playback',async()=>{
 audioTrace.start();h=audioHarness();await ready();
 h.manager.follow({userId:'user',id:'run21-bell:tri:late',startedAt:Date.now(),expiresAt:Date.now()+600,cueAt:()=>boxingBellCue});expect(h.starts()).toHaveLength(0);
 h.manager.setPreference('user',false);expect(JSON.parse(audioTrace.export()).entries).toEqual(expect.arrayContaining([expect.objectContaining({event:'schedule-window-short',durationMs:970}),expect.objectContaining({event:'context-retired',reason:'muted'})]));
});
it('uses distinguishable quick hold tones and stops their sources immediately on mute',async()=>{
 h=audioHarness();await ready();
 h.manager.present({userId:'user',id:'hold',cue:quintzeeHoldCue(true)});h.manager.present({userId:'user',id:'release',cue:quintzeeHoldCue(false)});
 const oscillators=h.nodes.filter(n=>n.kind==='oscillator');expect(oscillators.map(n=>n.frequency.setValueAtTime.mock.calls[0][0])).toEqual([660,880]);expect(h.starts()).toHaveLength(2);
 h.manager.setPreference('user',false);expect(oscillators.every(n=>n.stop.mock.calls.length>1)).toBe(true);
 h.manager.present({userId:'user',id:'muted',cue:quintzeeHoldCue(true)});expect(h.starts()).toHaveLength(2);h.manager.setPreference('user',true);expect(h.starts()).toHaveLength(2);
});
