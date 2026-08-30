import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderedDeliveryQueue } from './crossCountryNetwork';

describe('cross-country ordered WebSocket delivery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves frame order without adding independent delays cumulatively', async () => {
    vi.useFakeTimers();
    const delivered: string[] = [];
    const pending: number[] = [];
    let pendingCount = 0;
    const queue = new OrderedDeliveryQueue((delta) => {
      pendingCount += delta;
      pending.push(pendingCount);
    });

    queue.enqueue(100, () => delivered.push('first'));
    queue.enqueue(10, () => delivered.push('second'));

    await vi.advanceTimersByTimeAsync(99);
    expect(delivered).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await queue.drain();
    expect(delivered).toEqual(['first', 'second']);
    expect(pending).toEqual([1, 2, 1, 0]);
  });

  it('continues delivering later frames when a closed socket rejects one delivery', async () => {
    const delivered: string[] = [];
    const queue = new OrderedDeliveryQueue();

    queue.enqueue(0, () => { throw new Error('socket closed'); });
    queue.enqueue(0, () => delivered.push('replacement-safe'));
    await queue.drain();

    expect(delivered).toEqual(['replacement-safe']);
  });
});
