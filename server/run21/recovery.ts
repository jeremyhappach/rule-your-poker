import {AuthorityError, Run21Authority, type StoredMatch} from './authority.js';
import type {Match} from '../../src/lib/run21/model.js';

export type RecoveryRpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

/** A database-issued, expiring, single-use dispatch token admits a bounded wake.
 * PostgreSQL CAS serializes competing runtimes; neither HTTP success nor dispatch
 * alone counts as a healthy recovery heartbeat. The final acknowledgement does.
 */
export async function recoverRun21(rpc: RecoveryRpc, token: string) {
  const claim = await rpc<{accepted: boolean; games?: string[]}>('run21_recovery_claim', {p_token: token});
  if (!claim.accepted) throw new AuthorityError('run21:recovery_token_denied', 403);
  const commit = async (row: StoredMatch, state: Match, due: number | null) => {
    const cursor = row.state?.eventSequence ?? 0;
    const response = await rpc<{outcome: string; record: StoredMatch}>('run21_server_commit', {
      p_dealer_game_id: row.dealer_game_id, p_expected_revision: row.revision,
      p_state: {...state, events: state.events.filter(event => event.sequence > cursor)}, p_bot_due_at: due,
    });
    if (response.outcome !== 'committed') throw new AuthorityError('run21:concurrent_commit');
    return response.record;
  };
  const authority = new Run21Authority({
    load: gameId => rpc<StoredMatch[]>('run21_recovery_load', {p_token: token, p_game_id: gameId}),
    commit,
    confirm: async () => { throw new Error('run21:recovery_has_no_player_actions'); },
    close: async () => { throw new Error('run21:recovery_does_not_close_legacy_matches'); },
  }, undefined, undefined, undefined, false);
  const failures: string[] = [];
  let processed = 0;
  const started = Date.now();
  try {
    for (const gameId of claim.games ?? []) {
      if (Date.now() - started > 15_000) { failures.push('run21:recovery_budget'); break; }
      try { await authority.recoverOne(gameId); processed++; }
      catch (error) { failures.push(error instanceof AuthorityError ? error.code : 'run21:recovery_failed'); }
    }
    await rpc('run21_recovery_complete', {p_token: token, p_failure: failures[0] ?? null});
    return {processed, failures};
  } finally { authority.dispose(); }
}
