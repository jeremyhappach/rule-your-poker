import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthoritativeRecoveryScheduler } from './authoritativeRecoveryScheduler';

afterEach(() => vi.useRealTimers());
describe('one authoritative recovery schedule', () => {
  it('combines transport, lifecycle and missing-card needs without duplicate timers', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const scheduler = createAuthoritativeRecoveryScheduler(refresh);
    scheduler.setActive(true);
    scheduler.setReason('socket', true, 5000);
    scheduler.setReason('lifecycle', true, 3000);
    scheduler.setReason('cards', true, 2000);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.setReason('cards', false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.setReason('socket', false);
    scheduler.setReason('lifecycle', false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart recovery on repeated identical render needs or overlap a pending read', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const scheduler = createAuthoritativeRecoveryScheduler(refresh);
    scheduler.setActive(true);
    scheduler.setReason('lifecycle', true);
    await vi.advanceTimersByTimeAsync(1);
    scheduler.setReason('lifecycle', true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.setActive(false);
    finish();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});
