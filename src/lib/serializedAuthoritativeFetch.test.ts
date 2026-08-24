import { describe, expect, it } from 'vitest';
import { createSerializedAuthoritativeFetch } from './serializedAuthoritativeFetch';

describe('serialized authoritative fetch drain', () => {
  it('never overlaps a cold load with reconnect and applies both in order', async () => {
    let releaseCold!: () => void;
    const coldGate = new Promise<void>((resolve) => { releaseCold = resolve; });
    let concurrent = 0;
    let maxConcurrent = 0;
    const started: string[] = [];
    const drain = createSerializedAuthoritativeFetch<string>();
    drain.setRunner(async (source) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      started.push(source);
      if (source === 'cold') await coldGate;
      concurrent -= 1;
      return source !== 'reconnect-failed';
    });

    const cold = drain.request('cold');
    const reconnect = drain.request('reconnect-failed');
    expect(started).toEqual(['cold']);
    releaseCold();

    expect(await cold).toBe(false);
    expect(await reconnect).toBe(false);
    expect(started).toEqual(['cold', 'reconnect-failed']);
    expect(maxConcurrent).toBe(1);
  });

  it('coalesces a burst to the newest pending trigger', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const started: string[] = [];
    const drain = createSerializedAuthoritativeFetch<string>();
    drain.setRunner(async (source) => {
      started.push(source);
      if (source === 'first') await firstGate;
      return true;
    });

    const result = drain.request('first');
    void drain.request('intermediate');
    void drain.request('newest');
    releaseFirst();

    expect(await result).toBe(true);
    expect(started).toEqual(['first', 'newest']);
  });
});
