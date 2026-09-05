import { expect, it } from 'vitest';
import { mutationProgressTarget } from './mutationProgress';

it('requires exact round identity and excludes refused Holm decisions', () => {
  const request = { p_round_id: 'round-a' };
  expect(mutationProgressTarget('/holm_submit_decision', request, { round_id: 'round-a', turn_sequence: 2 }))
    .toEqual({ field: 'holmTurnSequence', roundId: 'round-a', value: 2 });
  for (const response of [{ round_id: 'round-b', turn_sequence: 2 },
    { round_id: 'round-a', turn_sequence: 2, not_current_turn: true }]) {
    expect(mutationProgressTarget('/holm_submit_decision', request, response)).toBeNull();
  }
});

it('requires the exact 357 participant decision and committed round', () => {
  const request = { p_round_id: 'round-a', p_player_id: 'player-a', p_decision: 'stay' };
  const response = { outcome: 'decision_committed', decision: 'stay', round: { id: 'round-a' } };
  expect(mutationProgressTarget('/three_five_seven_submit_decision', request, response))
    .toEqual({ field: 'decisionLocks', roundId: 'round-a', value: 'player-a' });
  expect(mutationProgressTarget('/three_five_seven_submit_decision', request, { ...response, decision: 'fold' })).toBeNull();
  expect(mutationProgressTarget('/three_five_seven_submit_decision', request, { ...response, round: { id: 'round-a', status: 'completed' } }))
    .toEqual({ field: 'roundStatus', roundId: 'round-a', value: 'completed' });
  expect(mutationProgressTarget('/three_five_seven_submit_decision', request, { ...response, outcome: 'refused', round: { id: 'round-a', status: 'completed' } })).toBeNull();
});

it('accepts only an applied Gin action or its matching immutable replay', () => {
  const request = { _round_id: 'round-a', _player_id: 'player-a', _action: 'draw_stock', _expected_action_count: 4 };
  const state = { actionCount: 5, lastAction: { type: 'draw_stock', playerId: 'player-a' } };
  for (const outcome of ['applied', 'stale_action']) {
    expect(mutationProgressTarget('/gin_rummy_apply_action', request, { outcome, state }))
      .toEqual({ field: 'ginActionCount', roundId: 'round-a', value: 5 });
  }
  expect(mutationProgressTarget('/gin_rummy_apply_action', request, { outcome: 'stale_action', state: { ...state, actionCount: 6 } })).toBeNull();
  expect(mutationProgressTarget('/gin_rummy_apply_action', request, { outcome: 'stale_action', state: { ...state, lastAction: { type: 'discard', playerId: 'player-a' } } })).toBeNull();
});
