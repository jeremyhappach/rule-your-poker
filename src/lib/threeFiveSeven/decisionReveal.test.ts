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
  drop_at: '2026-09-01T14:00:01.950Z',
  ends_at: '2026-09-01T14:00:03.350Z',
  continuation_at: '2026-09-01T14:00:07.350Z',
};

function clock(): ThreeFiveSevenDecisionRevealClock {
  return {
    window: parseThreeFiveSevenDecisionRevealWindow(rawWindow)!,
    serverOffsetMs: 0,
  };
}

describe('3-5-7 authoritative decision reveal', () => {
  it('derives 3-2-1-DROP-hold from the absolute server window', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base).beat).toBe('3');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 650).beat).toBe('2');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1300).beat).toBe('1');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1950).beat).toBe('DROP');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 2750).beat).toBe('hold');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 3350).beat).toBe('expired');
  });

  it('keeps decisions secret before DROP and reveals all on the same boundary', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1949).secrecyOpen).toBe(false);
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1950).secrecyOpen).toBe(true);
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
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 1500).beat).toBe('1');
    expect(deriveThreeFiveSevenDecisionRevealFrame(clock(), base + 6000)).toMatchObject({
      beat: 'expired',
      active: false,
    });
  });

  it('preserves the existing four-second dwell after the ritual tableau', () => {
    const base = Date.parse(rawWindow.started_at);
    expect(remainingThreeFiveSevenContinuationDelayMs(clock(), base + 3350)).toBe(4000);
    expect(remainingThreeFiveSevenContinuationDelayMs(clock(), base + 8000)).toBe(0);
  });
});
