import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearChaosTimeline,
  getActiveChaosProfile,
  getChaosStatus,
  startChaosSession,
  stopChaosSession,
  subscribeChaosStatus,
} from './networkSimChaos';

describe('continuous Cross-Country Chaos profile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T02:00:00Z'));
    clearChaosTimeline();
  });

  afterEach(() => {
    stopChaosSession();
    vi.useRealTimers();
  });

  it('replays the same complete phase schedule for the same client and seed', () => {
    const first = startChaosSession({ seed: 4281, clientKey: 'client-one', role: 'host' });
    stopChaosSession();
    const second = startChaosSession({ seed: 4281, clientKey: 'client-one', role: 'host' });

    expect(second).toEqual(first);
    expect(first.phases.map((phase) => phase.kind)).toEqual([
      'healthy',
      'long-haul-lag',
      'jitter-burst',
      'radio-stall',
      'recovery',
      'offline',
      'recovery',
      'healthy',
    ]);
  });

  it('continues into a fresh deterministic cycle instead of ending after one script', async () => {
    const first = startChaosSession({ seed: 99, clientKey: 'client-two', role: 'peer' });

    await vi.advanceTimersByTimeAsync(first.totalDurationMs + 1);

    expect(getChaosStatus()).toMatchObject({ active: true, cycleIndex: 1, phaseIndex: 0, phaseKind: 'healthy' });
    expect(getActiveChaosProfile()?.cycleIndex).toBe(1);
    expect(getActiveChaosProfile()?.phases.some((phase) => phase.kind === 'offline')).toBe(true);
  });

  it('publishes a real offline boundary followed by recovery', async () => {
    const statusChanges: string[] = [];
    const profile = startChaosSession({ seed: 72, clientKey: 'client-three', role: 'peer' });
    const unsubscribe = subscribeChaosStatus(() => {
      statusChanges.push(`${getChaosStatus().phaseKind}:${getChaosStatus().disconnected}`);
    });
    const offline = profile.phases.find((phase) => phase.kind === 'offline');
    expect(offline).toBeDefined();

    await vi.advanceTimersByTimeAsync(offline!.startMs);
    expect(getChaosStatus()).toMatchObject({ phaseKind: 'offline', disconnected: true });

    await vi.advanceTimersByTimeAsync(offline!.endMs - offline!.startMs);
    expect(getChaosStatus()).toMatchObject({ phaseKind: 'recovery', disconnected: false });
    expect(statusChanges).toContain('offline:true');
    expect(statusChanges).toContain('recovery:false');
    unsubscribe();
  });
});
