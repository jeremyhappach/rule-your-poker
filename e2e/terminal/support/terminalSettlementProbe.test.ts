import { describe, expect, it, vi } from 'vitest';
import { withProbeDeadline } from './terminalSettlementProbe';

describe('terminal settlement probe deadline', () => {
  it('retries an externally aborted Supabase observation', async () => {
    const operation = vi.fn(async () => {
      if (operation.mock.calls.length === 1) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      return 'observed';
    });

    await expect(withProbeDeadline(operation, 'test observation', 100, 2)).resolves.toBe('observed');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('reports observer unavailability after the bounded retry', async () => {
    const operation = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(withProbeDeadline(operation, 'test observation', 100, 2)).rejects.toThrow(
      'test observation unavailable after 2 attempts',
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not relabel an authoritative query error as transport trouble', async () => {
    const operation = vi.fn(async () => {
      throw new Error('permission denied');
    });

    await expect(withProbeDeadline(operation, 'test observation', 100, 2)).rejects.toThrow(
      'permission denied',
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
