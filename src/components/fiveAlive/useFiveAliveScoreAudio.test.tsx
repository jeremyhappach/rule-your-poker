// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useFiveAliveScoreAudio} from './useFiveAliveScoreAudio';
const {follow,unlock,stop}=vi.hoisted(()=>({follow:vi.fn(),unlock:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow,unlock}}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.clearAllMocks();});
it('admits the sound now for mute dedupe, wakes only after five seconds, and cancels on unmount',()=>{
 vi.useFakeTimers();vi.spyOn(performance,'now').mockReturnValue(1000);follow.mockReturnValue(stop);
 const phase={startedAt:6000,endsAt:6700,from:0,to:800};
 const {rerender,unmount}=renderHook(()=>useFiveAliveScoreAudio('user','word',phase,1000));
 expect(follow).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({startedAt:6000,expiresAt:6700}));
 rerender();act(()=>vi.advanceTimersByTime(5000));expect(unlock).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1));expect(unlock).toHaveBeenCalledTimes(1);
 unmount();expect(stop).toHaveBeenCalledTimes(1);
});
it('does not wake a discarded result or schedule sound for an unchanged score',()=>{
 vi.useFakeTimers();vi.spyOn(performance,'now').mockReturnValue(0);follow.mockReturnValue(stop);
 const {unmount}=renderHook(()=>useFiveAliveScoreAudio('user','word',{startedAt:5000,endsAt:5700,from:0,to:800},0));
 unmount();act(()=>vi.advanceTimersByTime(6000));expect(unlock).not.toHaveBeenCalled();
 follow.mockClear();renderHook(()=>useFiveAliveScoreAudio('user','zero',{startedAt:5000,endsAt:5700,from:0,to:0},0));expect(follow).not.toHaveBeenCalled();
});
