import { describe, expect, it } from 'vitest';
import { shouldCaptureWartime } from './capture';

describe('3-5-7 wartime capture policy', () => {
  it('is fail-closed unless an administrator explicitly enabled wartime', () => {
    expect(shouldCaptureWartime({
      explicitlyEnabled: false,
      activeGameId: 'game-1',
      activeGameType: '3-5-7',
      eventGameId: 'game-1',
    })).toBe(false);
  });

  it('rejects diagnostics while another game type owns the mounted table', () => {
    for (const gameType of ['holm-game', 'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee']) {
      expect(shouldCaptureWartime({
        explicitlyEnabled: true,
        activeGameId: 'game-1',
        activeGameType: gameType,
        eventGameId: 'game-1',
      })).toBe(false);
    }
  });

  it('requires an exact active game identity for scoped events', () => {
    expect(shouldCaptureWartime({
      explicitlyEnabled: true,
      activeGameId: 'game-1',
      activeGameType: '3-5-7-game',
      eventGameId: 'game-2',
    })).toBe(false);
    expect(shouldCaptureWartime({
      explicitlyEnabled: true,
      activeGameId: 'game-1',
      activeGameType: '357',
      eventGameId: 'game-1',
    })).toBe(true);
  });

  it('allows unscoped bootstrap events only while 3-5-7 is actively mounted', () => {
    expect(shouldCaptureWartime({
      explicitlyEnabled: true,
      activeGameId: 'game-1',
      activeGameType: '3-5-7',
      eventGameId: null,
    })).toBe(true);
  });
});
