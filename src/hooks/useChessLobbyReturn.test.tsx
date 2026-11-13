// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useChessLobbyReturn} from './useChessLobbyReturn';
afterEach(()=>vi.useRealTimers());
it('does not start before presentation completes, and repeated completion or rerenders cannot extend the hold',()=>{
 vi.useFakeTimers();const first=vi.fn(),second=vi.fn();const hook=renderHook(({leave})=>useChessLobbyReturn(leave),{initialProps:{leave:first}});
 act(()=>vi.advanceTimersByTime(6000));expect(first).not.toHaveBeenCalled();expect(hook.result.current.holding).toBe(false);
 act(()=>hook.result.current.complete());act(()=>vi.advanceTimersByTime(2000));hook.rerender({leave:second});act(()=>hook.result.current.complete());act(()=>vi.advanceTimersByTime(2999));expect(second).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(second).toHaveBeenCalledTimes(1);expect(first).not.toHaveBeenCalled();hook.unmount();
});
it('cancels navigation when the held board unmounts',()=>{vi.useFakeTimers();const leave=vi.fn(),hook=renderHook(()=>useChessLobbyReturn(leave));act(()=>hook.result.current.complete());hook.unmount();act(()=>vi.advanceTimersByTime(10000));expect(leave).not.toHaveBeenCalled();});
