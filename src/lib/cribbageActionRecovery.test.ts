import { describe, expect, it, vi } from 'vitest';
import {
  executeReplaySafeCribbageAction,
  isRetryableCribbageActionError,
} from './cribbageActionRecovery';

describe('Cribbage action transport recovery', () => {
  it('returns the first successful authoritative response without replaying', async () => {
    const operation = vi.fn(async () => ({ outcome: 'applied' }));

    await expect(executeReplaySafeCribbageAction(operation, { timeoutMs: 100 })).resolves.toEqual({
      outcome: 'applied',
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays the exact immutable intent after a lost response', async () => {
    const intent = { roundId: 'round-1', cardIndex: 2, expectedEventSequence: 7 } as const;
    const seen: unknown[] = [];
    const operation = vi.fn(async () => {
      seen.push(intent);
      if (seen.length === 1) throw new TypeError('Failed to fetch');
      return { outcome: 'stale', eventSequence: 8 };
    });

    await expect(executeReplaySafeCribbageAction(operation, {
      timeoutMs: 100,
      retryDelayMs: 0,
    })).resolves.toEqual({ outcome: 'stale', eventSequence: 8 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([intent, intent]);
  });

  it('retries PostgreSQL statement cancellation but not rule rejection', async () => {
    const timedOut = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014',
    });
    const timeoutOperation = vi.fn()
      .mockRejectedValueOnce(timedOut)
      .mockResolvedValueOnce({ outcome: 'applied' });

    await expect(executeReplaySafeCribbageAction(timeoutOperation, {
      timeoutMs: 100,
      retryDelayMs: 0,
    })).resolves.toEqual({ outcome: 'applied' });
    expect(timeoutOperation).toHaveBeenCalledTimes(2);

    const rejection = vi.fn(async () => {
      throw new Error('cribbage_apply_pegging_action:exceeds_31');
    });
    await expect(executeReplaySafeCribbageAction(rejection, { timeoutMs: 100 })).rejects.toThrow(
      'exceeds_31',
    );
    expect(rejection).toHaveBeenCalledTimes(1);
  });

  it('releases the caller after the bounded retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const operation = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const request = executeReplaySafeCribbageAction(operation, {
      timeoutMs: 50,
      retryDelayMs: 10,
    });
    const assertion = expect(request).rejects.toThrow('could not be confirmed after 2 attempts');

    await vi.advanceTimersByTimeAsync(120);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recognizes browser, harness, and PostgreSQL timeout failures', () => {
    expect(isRetryableCribbageActionError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isRetryableCribbageActionError(new Error('simulated response loss after send'))).toBe(true);
    expect(isRetryableCribbageActionError({ code: '57014', message: 'statement canceled' })).toBe(true);
    expect(isRetryableCribbageActionError(new Error('rule violation'))).toBe(false);
  });
});
