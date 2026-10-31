import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useCompletionRetry} from '@/hooks/useCompletionRetry';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();});
it('backs off, caps failures, and resumes budget only through explicit recovery',async()=>{
 const h=renderHook(()=>useCompletionRetry('session:dealer:round'));
 for(let i=0;i<4;i++){
  const receipt=h.result.current.begin();expect(receipt).not.toBeNull();expect(h.result.current.begin()).toBeNull();
  act(()=>receipt!.fail(()=>{}));expect(h.result.current.begin()).toBeNull();await act(()=>vi.advanceTimersByTimeAsync(1000));
 }
 expect(h.result.current.begin()).toBeNull();await act(()=>vi.advanceTimersByTimeAsync(30000));expect(h.result.current.begin()).toBeNull();
 act(()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));expect(h.result.current.begin()).not.toBeNull();
});
it('ignores replies after identity changes and never repeats an accepted receipt',()=>{
 const after=vi.fn(),h=renderHook(({id})=>useCompletionRetry(id),{initialProps:{id:'old'}});const old=h.result.current.begin()!;
 h.rerender({id:'new'});const next=h.result.current.begin()!;act(()=>{old.fail(after);old.succeed(after);});expect(after).not.toHaveBeenCalled();expect(h.result.current.begin()).toBeNull();
 act(()=>{next.succeed(after);next.succeed(after);next.fail(after);});expect(after).toHaveBeenCalledTimes(1);expect(h.result.current.begin()).toBeNull();
});
it('cleanup removes retry timers and suppresses late completion callbacks',()=>{
 const after=vi.fn(),h=renderHook(()=>useCompletionRetry('id')),receipt=h.result.current.begin()!;h.unmount();act(()=>receipt.fail(after));expect(after).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
