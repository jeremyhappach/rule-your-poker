// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {run21FailureCueAt,RUN21_FAILURE_CUE_MS} from './failureCue';
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
