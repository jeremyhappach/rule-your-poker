import { describe, expect, it } from 'vitest';
import { shouldResetHolmProjection } from './holmProjectionLifecycle';

describe('Holm projection lifecycle', () => {
  it('resets a completed projection after authoritative dealer-game teardown', () => {
    expect(shouldResetHolmProjection({
      snapshotAvailable: false,
      presentedDealerGameId: 'dealer-game-1',
      currentDealerGameId: null,
      gameStatus: 'waiting',
    })).toBe(true);
  });

  it('resets a prior projection during the next dealer-game setup', () => {
    expect(shouldResetHolmProjection({
      snapshotAvailable: false,
      presentedDealerGameId: 'dealer-game-1',
      currentDealerGameId: 'dealer-game-2',
      gameStatus: 'ante_decision',
    })).toBe(true);
  });

  it('preserves the current projection through a transient same-game read gap', () => {
    expect(shouldResetHolmProjection({
      snapshotAvailable: false,
      presentedDealerGameId: 'dealer-game-1',
      currentDealerGameId: 'dealer-game-1',
      gameStatus: 'in_progress',
    })).toBe(false);
  });

  it('never resets while an authoritative snapshot is available', () => {
    expect(shouldResetHolmProjection({
      snapshotAvailable: true,
      presentedDealerGameId: 'dealer-game-1',
      currentDealerGameId: null,
      gameStatus: 'waiting',
    })).toBe(false);
  });
});
