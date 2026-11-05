// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {run21FailureCueAt,run21BustCueAt,RUN21_FAILURE_CUE_MS} from './failureCue';
import {loadAuditionedFixtures} from '@/lib/audio/approvedSounds.fixture';
beforeAll(loadAuditionedFixtures);
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();vi.spyOn(document,'hidden','get').mockReturnValue(false);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('schedules two descending notes and completes inside 1.1 seconds',()=>{
  const h=audioHarness();const cue=run21FailureCueAt(0,1100);
  expect(cue.schedule(h.ctx as unknown as AudioContext,{} as AudioNode,node=>node)).toBe(true);
  expect(h.starts()).toEqual([10,10.45]);
  const tones=h.nodes.filter(n=>n.kind==='oscillator');
  expect(tones[0].frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBeLessThan(tones[0].frequency.setValueAtTime.mock.calls[0][0]);
  expect(tones[1].frequency.setValueAtTime.mock.calls[0][0]).toBeLessThan(tones[0].frequency.setValueAtTime.mock.calls[0][0]);
  expect(Math.max(...tones.map(n=>n.stop.mock.calls[0][0]))).toBeCloseTo(11.098);
  h.dispose();
});
it('respects mute and refuses delayed unmute, then admits a new live result',async()=>{
  const h=audioHarness(async()=>false);await Promise.resolve();await Promise.resolve();
  const follow=(id:string)=>h.manager.follow({userId:'user',id,startedAt:Date.now(),expiresAt:Date.now()+RUN21_FAILURE_CUE_MS,cueAt:run21FailureCueAt});
  follow('muted');expect(h.starts()).toHaveLength(0);
  vi.advanceTimersByTime(200);h.manager.setPreference('user',true);expect(h.starts()).toHaveLength(0);
  follow('fresh');expect(h.starts()).toHaveLength(2);
  h.manager.setPreference('user',false);expect(h.nodes.filter(n=>n.kind==='oscillator').every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
  h.manager.setPreference('user',true);follow('fresh');expect(h.starts()).toHaveLength(2);
  h.dispose();
});
it('uses the selected crumble alone, refuses late onset and stops immediately on mute',async()=>{
 const h=audioHarness();for(let i=0;i<6;i++)await Promise.resolve();
 const follow=(id:string)=>h.manager.follow({userId:'user',id,startedAt:Date.now(),expiresAt:Date.now()+RUN21_FAILURE_CUE_MS,cueAt:run21BustCueAt});
 follow('bust');expect(h.nodes.filter(n=>n.kind==='buffer'&&n.start.mock.calls.length)).toHaveLength(1);expect(h.nodes.filter(n=>n.kind==='oscillator')).toHaveLength(0);
 follow('bust');expect(h.starts()).toHaveLength(1);h.manager.setPreference('user',false);expect(h.nodes.filter(n=>n.kind==='buffer').every(n=>n.disconnect.mock.calls.length)).toBe(true);
 vi.advanceTimersByTime(200);h.manager.setPreference('user',true);follow('bust');expect(h.starts()).toHaveLength(1);
 for(const [elapsed,remaining] of [[81,1100],[0,500]])expect(run21BustCueAt(elapsed,remaining).schedule(h.ctx as unknown as AudioContext,{} as AudioNode,n=>n)).toBe(false);
 h.dispose();
});
