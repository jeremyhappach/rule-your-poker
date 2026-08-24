import { describe, expect, it } from 'vitest';
import {
  mergeAuthoritativeGameState,
  shouldPublishGamesRealtimeRowDirectly,
} from './authoritativeGameState';

const initial = {
  id: 'game-1',
  status: 'waiting',
  updated_at: '2026-08-24T14:08:26.000Z',
  dealer_selection_state: null,
  last_round_result: null,
  rounds: [{ id: 'round-existing' }],
};

describe('authoritative games-row merge', () => {
  it('delivers a co-published dealer draw to every client while preserving joined rounds', () => {
    const receipt = {
      id: 'game-1',
      status: 'dealer_selection',
      updated_at: '2026-08-24T14:08:27.000Z',
      dealer_selection_state: {
        cards: [{ position: 2 }, { position: 6 }],
        winnerPosition: 6,
        isComplete: true,
      },
    };

    const clientOne = mergeAuthoritativeGameState(initial, receipt);
    const clientTwo = mergeAuthoritativeGameState({ ...initial }, receipt);

    expect(clientOne?.dealer_selection_state).toEqual(receipt.dealer_selection_state);
    expect(clientTwo?.dealer_selection_state).toEqual(receipt.dealer_selection_state);
    expect(clientOne?.rounds).toEqual(initial.rounds);
    expect(clientTwo?.rounds).toEqual(initial.rounds);
  });

  it('adopts terminal result and status from the same row image', () => {
    expect(mergeAuthoritativeGameState(initial, {
      id: 'game-1',
      status: 'game_over',
      updated_at: '2026-08-24T14:11:57.909Z',
      last_round_result: '🏆 Winner won the game with 3 legs!',
    })).toMatchObject({
      status: 'game_over',
      last_round_result: '🏆 Winner won the game with 3 legs!',
    });
  });

  it('rejects a strictly older snapshot and a different game identity', () => {
    expect(mergeAuthoritativeGameState(initial, {
      id: 'game-1',
      status: 'ante_decision',
      updated_at: '2026-08-24T14:08:25.000Z',
    })).toBe(initial);
    expect(mergeAuthoritativeGameState(initial, {
      id: 'game-2',
      status: 'game_over',
      updated_at: '2026-08-24T14:08:28.000Z',
    })).toBe(initial);
  });
});

describe('games-row Realtime publication ownership', () => {
  it('keeps pre-hand lifecycle rows directly publishable for all seven games', () => {
    for (const gameType of [
      '3-5-7',
      'holm-game',
      'cribbage',
      'gin-rummy',
      'horses',
      'ship-captain-crew',
      'yahtzee',
    ]) {
      expect(shouldPublishGamesRealtimeRowDirectly({
        game_type: gameType,
        status: 'dealer_selection',
      }), gameType).toBe(true);
    }
  });

  it('routes active 3-5-7 through its atomic frame while preserving direct rows for every other family', () => {
    for (const status of ['in_progress', 'game_over', 'session_ended']) {
      expect(shouldPublishGamesRealtimeRowDirectly({
        game_type: '3-5-7',
        status,
      }), status).toBe(false);
    }

    for (const gameType of [
      'holm-game',
      'cribbage',
      'gin-rummy',
      'horses',
      'ship-captain-crew',
      'yahtzee',
    ]) {
      expect(shouldPublishGamesRealtimeRowDirectly({
        game_type: gameType,
        status: 'in_progress',
      }), gameType).toBe(true);
    }
  });
});
