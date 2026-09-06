import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeDiceRequest, executeDiceRpc } from './diceRequestRecovery';

describe('dice request recovery', () => {
  afterEach(() => vi.useRealTimers());

  it('bounds a request even when the transport ignores abort', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const operation = vi.fn((signal: AbortSignal) => { signals.push(signal); return new Promise<never>(() => {}); });
    const result = executeDiceRequest(operation, { timeoutMs: 50 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).message).toContain('timed out');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replays the identical action sequence after a lost acknowledgement and accepts the stale receipt', async () => {
    vi.useFakeTimers();
    const payload = { _round_id: 'round-a', _expected_action_sequence: 7, _action: 'roll' };
    let late!: (value: unknown) => void;
    const first = new Promise(resolve => { late = resolve; });
    const receipt = { outcome: 'stale_action', state: { actionSequence: 8 } };
    const rpc = vi.fn().mockReturnValueOnce({ abortSignal: () => first })
      .mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: receipt, error: null }) });
    const result = executeDiceRpc({ rpc }, 'horses_scc_apply_action', payload);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual(receipt);
    expect(rpc.mock.calls.map(call => call[1])).toEqual([payload, payload]);
    late({ data: { state: { actionSequence: 7 } }, error: null });
    await Promise.resolve();
    expect(await result).toEqual(receipt);
  });

  it('does not retry unversioned actions or rule/authorization errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('network failure'));
    await expect(executeDiceRequest(operation, { replaySafe: false })).rejects.toThrow('network failure');
    expect(operation).toHaveBeenCalledTimes(1);
    const denied = vi.fn().mockRejectedValue({ code: '42501', message: 'not authorized' });
    await expect(executeDiceRequest(denied)).rejects.toEqual({ code: '42501', message: 'not authorized' });
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
