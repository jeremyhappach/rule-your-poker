import { describe, expect, it, vi } from 'vitest';
import { createCribbageCountingProgressQueue } from './countingProgressQueue';

describe('Cribbage counting progress queue', () => {
  it('keeps one write in flight and coalesces waiting cursors to the newest value', async () => {
    let releaseFirst: (() => void) | null = null;
    const write = vi.fn(async () => {
      if (write.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    });
    const queue = createCribbageCountingProgressQueue({ write });

    queue.enqueue({ roundId: 'round-1', targetIndex: 0, beatIndex: 0 });
    queue.enqueue({ roundId: 'round-1', targetIndex: 0, beatIndex: 1 });
    queue.enqueue({ roundId: 'round-1', targetIndex: 1, beatIndex: -1 });
    queue.enqueue({ roundId: 'round-1', targetIndex: 0, beatIndex: 1 });

    expect(write).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1][0]).toEqual({
      roundId: 'round-1',
      targetIndex: 1,
      beatIndex: -1,
    });
  });

  it('drops duplicate and regressive cursors after a successful write', async () => {
    const write = vi.fn(async () => {});
    const queue = createCribbageCountingProgressQueue({ write });

    queue.enqueue({ roundId: 'round-1', targetIndex: 2, beatIndex: 3 });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    queue.enqueue({ roundId: 'round-1', targetIndex: 2, beatIndex: 3 });
    queue.enqueue({ roundId: 'round-1', targetIndex: 1, beatIndex: 9 });
    await Promise.resolve();

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('reports a failed flight and still drains the newest pending cursor', async () => {
    const onError = vi.fn();
    const write = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    const queue = createCribbageCountingProgressQueue({ write, onError });

    queue.enqueue({ roundId: 'round-1', targetIndex: 0, beatIndex: 0 });
    queue.enqueue({ roundId: 'round-1', targetIndex: 0, beatIndex: 2 });

    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[1][0].beatIndex).toBe(2);
  });
});
