// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHolmShowdownDelay } from './useHolmShowdownDelay';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
it('finishes after effect replay without borrowing an unfinished receipt', () => {
  const h = renderHook(() => useHolmShowdownDelay('dealer|r1', true, 2000), { wrapper: StrictMode });
  tick(2050); expect(h.result.current).toBe(true);
});
it('rearms after a late timing response cancels the original dwell', () => {
  const h = renderHook(({ delay }) => useHolmShowdownDelay('dealer|r1', true, delay), { initialProps: { delay: 2000 } });
  tick(500); h.rerender({ delay: 1800 }); tick(1850); expect(h.result.current).toBe(true);
});
it('rearms after a transient exposed-card gap and isolates a successor hand', () => {
  const h = renderHook(({ hand, exposed }) => useHolmShowdownDelay(hand, exposed, 2000), { initialProps: { hand: 'dealer|r1', exposed: true } });
  tick(500); h.rerender({ hand: 'dealer|r1', exposed: false }); tick(3000); expect(h.result.current).toBe(false);
  h.rerender({ hand: 'dealer|r1', exposed: true }); tick(2050); expect(h.result.current).toBe(true);
  h.rerender({ hand: 'dealer|r2', exposed: true }); expect(h.result.current).toBe(false);
  tick(2050); expect(h.result.current).toBe(true);
});
