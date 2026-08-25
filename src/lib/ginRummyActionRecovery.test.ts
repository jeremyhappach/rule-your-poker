import { describe, expect, it, vi } from 'vitest';
import {
  executeReplaySafeGinAction,
  isRetryableGinTransportError,
} from './ginRummyActionRecovery';

describe('Gin action transport recovery', () => {
  it('returns the first successful authoritative response without replaying', async () => {
    const operation = vi.fn(async () => ({ outcome: 'applied' }));

    await expect(executeReplaySafeGinAction(operation, { timeoutMs: 100 })).resolves.toEqual({
      outcome: 'applied',
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('replays the exact request after a lost response and accepts stale_action reconciliation', async () => {
    const requestIdentity = { expectedActionCount: 7, action: 'discard' } as const;
    const seenIdentities: unknown[] = [];
    const operation = vi.fn(async () => {
      seenIdentities.push(requestIdentity);
      if (seenIdentities.length === 1) throw new TypeError('Failed to fetch');
      return { outcome: 'stale_action', actionCount: 8 };
    });

    await expect(executeReplaySafeGinAction(operation, {
      timeoutMs: 100,
      retryDelayMs: 0,
    })).resolves.toEqual({ outcome: 'stale_action', actionCount: 8 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(seenIdentities).toEqual([requestIdentity, requestIdentity]);
  });

  it('does not replay an authoritative rule error', async () => {
    const operation = vi.fn(async () => {
      throw new Error('Gin action targeted a stale hand identity');
    });

    await expect(executeReplaySafeGinAction(operation, { timeoutMs: 100 })).rejects.toThrow(
      'stale hand identity',
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('releases the caller after the bounded retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const operation = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const request = executeReplaySafeGinAction(operation, {
      timeoutMs: 50,
      retryDelayMs: 10,
    });
    const assertion = expect(request).rejects.toThrow('could not be confirmed after 2 attempts');

    await vi.advanceTimersByTimeAsync(120);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recognizes the browser and chaos-harness transport failures', () => {
    expect(isRetryableGinTransportError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isRetryableGinTransportError(new Error('simulated response loss after send'))).toBe(true);
    expect(isRetryableGinTransportError(new Error('rule violation'))).toBe(false);
  });
});

