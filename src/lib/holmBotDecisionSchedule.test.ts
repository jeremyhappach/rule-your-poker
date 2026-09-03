import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHolmBotDecisionAfterDelay } from './holmBotDecisionSchedule';

describe('Holm bot decision schedule', () => {
  afterEach(() => vi.useRealTimers());

  it('does not resolve before its delay and authoritative attempt both finish', async () => {
    vi.useFakeTimers();
    let resolveSubmission: ((value: 'committed') => void) | null = null;
    const submit = vi.fn(() => new Promise<'committed'>((resolve) => {
      resolveSubmission = resolve;
    }));

    const pending = runHolmBotDecisionAfterDelay(2, submit);
    let settled = false;
    void pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(1999);
    expect(submit).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveSubmission?.('committed');
    await expect(pending).resolves.toBe('committed');
  });

  it('propagates an authoritative rejection after the configured delay', async () => {
    vi.useFakeTimers();
    const submit = vi.fn().mockRejectedValue(new Error('not_current_turn'));
    const pending = runHolmBotDecisionAfterDelay(0.1, submit);
    const rejection = expect(pending).rejects.toThrow('not_current_turn');

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
