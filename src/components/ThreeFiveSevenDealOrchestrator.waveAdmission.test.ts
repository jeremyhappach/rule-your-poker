import { describe, expect, it } from 'vitest';

import { classifyThreeFiveSevenWaveAdmission } from '@/lib/threeFiveSeven/waveAdmission';

describe('3-5-7 exact wave admission', () => {
  const players = ['player-1', 'player-2'];

  it('dispatches a new live DG1R1 wave exactly once', () => {
    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 1,
      activePlayerIds: players,
      expectedCount: 0,
      settledCountForPlayer: () => 0,
    })).toBe('dispatch');

    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 1,
      activePlayerIds: players,
      expectedCount: 6,
      settledCountForPlayer: () => 0,
    })).toBe('already-admitted');
  });

  it('never adds a reconstructed DG1R1 wave a second time when the ante gate opens late', () => {
    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 1,
      activePlayerIds: players,
      expectedCount: 6,
      settledCountForPlayer: () => 3,
    })).toBe('already-settled');
  });

  it('admits only the missing cumulative wave for rounds two and three', () => {
    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 2,
      activePlayerIds: players,
      expectedCount: 6,
      settledCountForPlayer: () => 3,
    })).toBe('dispatch');
    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 2,
      activePlayerIds: players,
      expectedCount: 10,
      settledCountForPlayer: () => 5,
    })).toBe('already-settled');
    expect(classifyThreeFiveSevenWaveAdmission({
      roundNumber: 3,
      activePlayerIds: players,
      expectedCount: 10,
      settledCountForPlayer: () => 5,
    })).toBe('dispatch');
  });
});
