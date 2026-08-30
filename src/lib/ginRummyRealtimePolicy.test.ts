import { describe, expect, it } from 'vitest';

import {
  buildGinGamesRealtimeRoutingSnapshot,
  isRoutineGinGamesRealtimeUpdate,
} from './ginRummyRealtimePolicy';

const liveGin = {
  status: 'in_progress',
  game_type: 'gin-rummy',
  current_game_uuid: 'dealer-1',
  current_round: 1,
  total_hands: 2,
  awaiting_next_round: false,
  is_paused: false,
  paused_time_remaining: null,
  pot: 20,
  dealer_position: 1,
  all_decisions_in: false,
  all_decisions_in_round_id: null,
  dealer_selection_complete: true,
  dealer_selection_state: null,
};

describe('Gin games Realtime routing policy', () => {
  it('suppresses a metadata-only games receipt', () => {
    expect(isRoutineGinGamesRealtimeUpdate(
      { ...liveGin, updated_at: 'later', last_activity: 'later' },
      buildGinGamesRealtimeRoutingSnapshot(liveGin),
    )).toBe(true);
  });

  it.each([
    ['status', 'game_over'],
    ['current_game_uuid', 'dealer-2'],
    ['current_round', 2],
    ['total_hands', 3],
    ['awaiting_next_round', true],
    ['is_paused', true],
    ['pot', 30],
  ])('retains full transition handling when %s changes', (field, value) => {
    expect(isRoutineGinGamesRealtimeUpdate(
      { ...liveGin, [field]: value },
      buildGinGamesRealtimeRoutingSnapshot(liveGin),
    )).toBe(false);
  });

  it('never suppresses another game family', () => {
    const holm = { ...liveGin, game_type: 'holm-game' };
    expect(isRoutineGinGamesRealtimeUpdate(
      { ...holm, last_activity: 'later' },
      buildGinGamesRealtimeRoutingSnapshot(holm),
    )).toBe(false);
  });
});
