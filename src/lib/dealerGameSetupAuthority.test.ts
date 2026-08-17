// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  parseDealerGameSetupCommitResult,
  type DealerGameType,
} from './dealerGameSetupAuthority';

const deadline = '2026-08-18T01:00:00.000Z';
const gameTypes: DealerGameType[] = [
  '3-5-7',
  'holm-game',
  'cribbage',
  'gin-rummy',
  'horses',
  'ship-captain-crew',
  'yahtzee',
];

function committed(gameType: DealerGameType, outcome: 'configured' | 'already_configured' = 'configured') {
  return {
    outcome,
    deduped: outcome === 'already_configured',
    setup_identity: {
      game_id: 'game-1',
      dealer_position: 2,
      expected_config_deadline: '2026-08-17T20:00:00-05:00',
    },
    game: {
      id: 'game-1',
      status: 'ante_decision',
      config_complete: true,
      current_game_uuid: 'dealer-game-1',
    },
    dealer_game: {
      id: 'dealer-game-1',
      session_id: 'game-1',
      game_type: gameType,
    },
    players: [
      {
        id: 'dealer-player-1',
        position: 2,
        ante_decision: 'ante_up',
        sitting_out: false,
      },
      {
        id: 'other-player-1',
        position: 1,
        ante_decision: null,
        sitting_out: false,
      },
    ],
  };
}

const expected = (gameType: DealerGameType) => ({
  gameId: 'game-1',
  dealerPlayerId: 'dealer-player-1',
  expectedDealerPosition: 2,
  expectedConfigDeadline: deadline,
  gameType,
});

describe('dealer-game setup committed result', () => {
  it.each(gameTypes)('accepts the exact atomic %s handoff', (gameType) => {
    expect(parseDealerGameSetupCommitResult(committed(gameType), expected(gameType)))
      .toEqual(committed(gameType));
  });

  it('returns the stored exact result to a duplicate caller', () => {
    expect(parseDealerGameSetupCommitResult(
      committed('3-5-7', 'already_configured'),
      expected('3-5-7'),
    ).deduped).toBe(true);
  });

  it.each([
    ['deadline', { setup_identity: { ...committed('3-5-7').setup_identity, expected_config_deadline: '2026-08-18T01:00:01Z' } }],
    ['dealer position', { setup_identity: { ...committed('3-5-7').setup_identity, dealer_position: 3 } }],
    ['dealer game', { game: { ...committed('3-5-7').game, current_game_uuid: 'newer-dealer-game' } }],
    ['dealer player', { players: committed('3-5-7').players.map((player) => ({ ...player, id: `other-${player.id}` })) }],
  ])('rejects a mismatched %s identity', (_label, patch) => {
    expect(() => parseDealerGameSetupCommitResult(
      { ...committed('3-5-7'), ...patch },
      expected('3-5-7'),
    )).toThrow(/mismatched committed result/);
  });
});
