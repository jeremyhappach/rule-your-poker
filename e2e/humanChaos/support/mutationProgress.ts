export type MutationProgressTarget = {
  roundId: string;
} & ({ field: 'holmTurnSequence' | 'ginActionCount'; value: number }
  | { field: 'decisionLocks'; value: string }
  | { field: 'roundStatus'; value: 'completed' });

type JsonRecord = Record<string, any>;
const record = (value: unknown): JsonRecord | null => value !== null && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : null;
const integer = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0;

export function tracksMutationProgress(endpoint: string): boolean {
  return /\/(holm_submit_decision|three_five_seven_submit_decision|gin_rummy_apply_action)$/.test(endpoint);
}

/** Keep only identity/progress receipts, never response hands or request cards. */
export function mutationProgressTarget(
  endpoint: string, request: unknown, response: unknown,
): MutationProgressTarget | null {
  const input = record(request), result = record(response);
  if (!input || !result) return null;
  if (endpoint.endsWith('/gin_rummy_apply_action')) {
    const state = record(result.state);
    if (typeof input._round_id !== 'string' || !integer(input._expected_action_count)
      || !state || !integer(state.actionCount) || state.actionCount !== input._expected_action_count + 1) return null;
    const last = record(state.lastAction);
    const matchingReplay = result.outcome === 'stale_action' && last?.type === input._action
      && last?.playerId === input._player_id
      && (!input._card || (last.card?.rank === input._card.rank && last.card?.suit === input._card.suit));
    if (result.outcome !== 'applied' && !matchingReplay) return null;
    return { field: 'ginActionCount', roundId: input._round_id, value: state.actionCount };
  }
  if (typeof input.p_round_id !== 'string') return null;
  if (endpoint.endsWith('/three_five_seven_submit_decision')) {
    if (!['decision_committed', 'already_decided'].includes(result.outcome)
      || result.round?.id !== input.p_round_id || result.decision !== input.p_decision
      || typeof input.p_player_id !== 'string') return null;
    // Settlement may clear participant locks in this same transaction. Only
    // the exact committed response can substitute its completed-round target.
    return result.round.status === 'completed'
      ? { field: 'roundStatus', roundId: input.p_round_id, value: 'completed' }
      : { field: 'decisionLocks', roundId: input.p_round_id, value: input.p_player_id };
  }
  if (endpoint.endsWith('/holm_submit_decision')) {
    const denied = ['already_locked', 'already_terminal', 'round_not_betting', 'player_not_eligible',
      'stale_round', 'not_current_turn', 'game_paused', 'wrong_game_type'];
    if (denied.some(flag => result[flag] === true) || result.error
      || result.round_id !== input.p_round_id || !integer(result.turn_sequence)) return null;
    return { field: 'holmTurnSequence', roundId: input.p_round_id, value: result.turn_sequence };
  }
  return null;
}
