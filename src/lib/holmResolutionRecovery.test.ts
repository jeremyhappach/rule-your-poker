import { describe, expect, it } from 'vitest';

import { getHolmResolutionRecoveryKey } from './holmResolutionRecovery';

const eligible = {
  gameId: 'game-1',
  gameType: 'holm-game',
  gameStatus: 'in_progress',
  dealerGameId: 'dealer-game-1',
  roundId: 'round-1',
  roundStatus: 'betting',
  allDecisionsInForRound: true,
  participantPresent: true,
};

describe('getHolmResolutionRecoveryKey', () => {
  it('admits the all-decisions-in betting edge using full game identity', () => {
    expect(getHolmResolutionRecoveryKey(eligible)).toBe(
      'game-1:dealer-game-1:round-1',
    );
  });

  it.each([
    { gameType: '3-5-7-game' },
    { gameStatus: 'game_over' },
    { roundStatus: 'processing' },
    { allDecisionsInForRound: false },
    { participantPresent: false },
  ])('rejects non-recovery state %#', (override) => {
    expect(getHolmResolutionRecoveryKey({ ...eligible, ...override })).toBeNull();
  });
});
