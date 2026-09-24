import { describe, expect, it } from 'vitest';
import {
  deriveThreeFiveSevenDecisionRevealFrame,
  parseThreeFiveSevenDecisionRevealWindow,
  reconcileThreeFiveSevenDecisionRevealClock,
  remainingThreeFiveSevenContinuationDelayMs,
  type ThreeFiveSevenDecisionRevealClock,
} from './decisionReveal';

const rawWindow = {
  id: 'dg-1:round-1',
  game_id: 'game-1',
  dealer_game_id: 'dg-1',
  round_id: 'round-1',
  hand_number: 2,
  round_number: 3,
  started_at: '2026-09-01T14:00:00.000Z',
  countdown_at: '2026-09-01T14:00:01.000Z',
  drop_at: '2026-09-01T14:00:03.700Z',
  ends_at: '2026-09-01T14:00:05.300Z',
  continuation_at: '2026-09-01T14:00:09.300Z',
};

function clock(): ThreeFiveSevenDecisionRevealClock {
  return {
    window: parseThreeFiveSevenDecisionRevealWindow(rawWindow)!,
    serverOffsetMs: 0,
  };
}

describe('3-5-7 authoritative decision reveal', () => {
  it('schedules an early disclosure retry from server time even when the estimated clock is ahead', () => {
    const received = Date.parse(rawWindow.drop_at) + 400;
    const retry = reconcileThreeFiveSevenDecisionRevealClock(null, clock().window, 900, 'round-1',
      '2026-09-01T14:00:03.500Z', received)!;
    expect(retry.disclosureNotBeforeLocalMs).toBe(received + 200);
    const disclosed = { ...clock().window, resolvedDecisions: { p1: 'fold' as const } };
    expect(reconcileThreeFiveSevenDecisionRevealClock(retry, disclosed, 900, 'round-1',
      rawWindow.drop_at, received)?.disclosureNotBeforeLocalMs).toBeUndefined();
  });
  it('admits an immutable authorized map without reconstructing legacy decisions', () => {
    const window = parseThreeFiveSevenDecisionRevealWindow({ ...rawWindow, resolved_decisions: { p1: 'fold', p2: 'stay' } })!;
    expect(window.resolvedDecisions).toEqual({ p1: 'fold', p2: 'stay' });
    expect(Object.isFrozen(window.resolvedDecisions)).toBe(true);
    expect(clock().window.resolvedDecisions).toBeNull();
    expect(() => parseThreeFiveSevenDecisionRevealWindow({ ...rawWindow, resolved_decisions: { p1: 'unknown' } })).toThrow('malformed_decisions');
  });

  it('does not erase an authorized snapshot when an earlier concealed reply arrives', () => {
    const disclosed = { ...clock(), window: parseThreeFiveSevenDecisionRevealWindow({ ...rawWindow, resolved_decisions: { p1: 'fold' } })! };
    expect(reconcileThreeFiveSevenDecisionRevealClock(disclosed, clock().window, 0, 'round-1')?.window.resolvedDecisions).toEqual({ p1: 'fold' });
    expect(() => reconcileThreeFiveSevenDecisionRevealClock(disclosed,
      parseThreeFiveSevenDecisionRevealWindow({ ...rawWindow, resolved_decisions: { p1: 'stay' } }), 0, 'round-1')).toThrow('conflicting_snapshot');
  });

  it('rejects dealer/hand identity confusion and never carries a map into the next round', () => {
    const disclosed = { ...clock(), window: parseThreeFiveSevenDecisionRevealWindow({ ...rawWindow, resolved_decisions: { p1: 'fold' } })! };
    expect(() => reconcileThreeFiveSevenDecisionRevealClock(disclosed,
      { ...disclosed.window, handNumber: 3 }, 0, 'round-1')).toThrow('scope_identity_mismatch');
    const next = { ...clock().window, id: 'dg-1:round-2', roundId: 'round-2', roundNumber: 1, handNumber: 3 };
    expect(reconcileThreeFiveSevenDecisionRevealClock(disclosed, next, 0, 'round-2')?.window.resolvedDecisions).toBeNull();
  });
  it('derives locked-3-2-1-DROP-hold from the absolute server window', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base).beat).toBe('locked');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1000).beat).toBe('3');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1900).beat).toBe('2');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 2800).beat).toBe('1');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 3700).beat).toBe('DROP');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 4700)).toMatchObject({
      beat: 'hold',
      active: true,
    });
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 5300)).toMatchObject({
      beat: 'expired',
      active: false,
    });
  });

  it('keeps decisions secret before DROP and reveals all on the same boundary', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 3699).secrecyOpen).toBe(false);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 3700).secrecyOpen).toBe(true);
  });

  it('does not restart on duplicate delivery of the same immutable identity', () => {
    const first = clock();
    const duplicate = reconcileThreeFiveSevenDecisionRevealClock(
      first,
      parseThreeFiveSevenDecisionRevealWindow(rawWindow),
      12,
      'round-1',
    );
    expect(duplicate?.window.id).toBe(first.window.id);
    expect(duplicate?.window.startedAtMs).toBe(first.window.startedAtMs);
  });

  it('late mounts enter the current beat and expired reconnects do not replay', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1500).beat).toBe('3');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 2500).beat).toBe('2');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 6000)).toMatchObject({
      beat: 'expired',
      active: false,
    });
  });

  it('keeps the existing authoritative continuation deadline after the longer ritual', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(remainingThreeFiveSevenContinuationDelayMs(clock(), base + 5300)).toBe(4000);
    expect(remainingThreeFiveSevenContinuationDelayMs(clock(), base + 10000)).toBe(0);
  });
});
