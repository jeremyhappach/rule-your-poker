// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import {recoverRun21, type RecoveryRpc} from '../../../server/run21/recovery';
import {type StoredMatch} from '../../../server/run21/authority';
import {applyCommand, createMatch, prepareRound} from './engine';
import {DEFAULT_CONFIG, type Intent, type Match} from './model';
import {fixtureDeck, IDENTITY, PLAYERS, uuid} from './fixtures';

afterEach(() => vi.restoreAllMocks());

function fixture(started: boolean, firstPlacementSeconds?: number, realMoney = false) {
  const config = firstPlacementSeconds === undefined ? DEFAULT_CONFIG : {...DEFAULT_CONFIG, firstPlacementSeconds};
  let state = prepareRound(createMatch(IDENTITY, PLAYERS, 5, config, 1000), uuid(20), null, fixtureDeck([], 17), 1000);
  const intents: Intent[] = [{type: 'ready'}];
  if (started) intents.push({type: 'place', column: 0});
  for (const intent of intents) {
    const round = state.rounds[0];
    state = applyCommand(state, {identity: IDENTITY, roundId: round.id, playerId: PLAYERS[0].id,
      requestId: uuid(40 + round.boards[PLAYERS[0].id].revision), revision: round.boards[PLAYERS[0].id].revision,
      intent}, {kind: 'service'}, 1000).state;
  }
  let row: StoredMatch = {dealer_game_id: IDENTITY.dealerGameId, game_id: IDENTITY.sessionId, first_round_id: uuid(20),
    dealer_user_id: uuid(31), participants: PLAYERS.map((p, i) => ({...p, userId: uuid(30 + i), chips: 0})),
    stake: 5, balances: {}, revision: 1, state, bot_due_at: null, finished: false,
    financial_version: firstPlacementSeconds === undefined ? 1 : 2, first_placement_seconds: firstPlacementSeconds, real_money: realMoney};
  let claimed = false, complete: Record<string, unknown> | undefined;
  let commits = 0;
  const rpc: RecoveryRpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    if (name === 'run21_recovery_claim') {
      const accepted = args.p_token === uuid(90) && !claimed;
      if (accepted) claimed = true;
      return {accepted, games: [IDENTITY.sessionId]} as T;
    }
    if (name === 'run21_recovery_load') return [structuredClone(row)] as T;
    if (name === 'run21_server_commit') {
      if (row.revision !== args.p_expected_revision) return {outcome: 'conflict'} as T;
      row = {...row, state: args.p_state as Match, revision: row.revision + 1, bot_due_at: args.p_bot_due_at as number | null};
      commits++;
      return {outcome: 'committed', record: structuredClone(row)} as T;
    }
    if (name === 'run21_recovery_complete') { complete = args; return undefined as T; }
    throw new Error('unexpected RPC');
  };
  return {rpc, get row() {return row;}, get commits() {return commits;}, get complete() {return complete;}};
}

describe('durable Run21 worker', () => {
  it('respects the configured first-placement deadline without starting the speed clock', async () => {
    const f = fixture(false, 15);
    vi.spyOn(Date, 'now').mockReturnValue(15_999);
    await recoverRun21(f.rpc, uuid(90));
    expect(f.commits).toBe(0);
    expect(f.row.state!.rounds[0].boards[PLAYERS[0].id]).toMatchObject({startedAt: null, deadline: null, firstPlacementDeadline: 16_000});
  });
  it('starts fake-money automatic play at the first-placement deadline', async () => {
    const f = fixture(false, 30);
    vi.spyOn(Date, 'now').mockReturnValue(31_000);
    await recoverRun21(f.rpc, uuid(90));
    expect(f.row.state!.automaticPlayers).toEqual([PLAYERS[0].id]);
    expect(f.row.state!.rounds[0].boards[PLAYERS[0].id].result).toBeNull();
    expect(f.row.bot_due_at).toBeGreaterThan(31_000);
  });
  it('freezes a real-money match instead of auto-playing an absent human', async () => {
    const f = fixture(false, 30, true);
    vi.spyOn(Date, 'now').mockReturnValue(31_000);
    await recoverRun21(f.rpc, uuid(90));
    expect(f.row.state!.pausedAt).toBe(31_000);
    expect(f.row.state!.automaticPlayers).toBeUndefined();
    expect(f.row.state!.cumulative).toEqual({[PLAYERS[0].id]: 0, [PLAYERS[1].id]: 0});
    expect(f.row.bot_due_at).toBeNull();
  });
  it('rejects an invalid or already claimed dispatch token', async () => {
    const f = fixture(false);
    await expect(recoverRun21(f.rpc, uuid(91))).rejects.toThrow('recovery_token_denied');
    await recoverRun21(f.rpc, uuid(90));
    await expect(recoverRun21(f.rpc, uuid(90))).rejects.toThrow('recovery_token_denied');
    expect(f.commits).toBe(0);
  });
  it('recovers an overdue persisted turn in a fresh process without retaining timers', async () => {
    const f = fixture(true);
    const deadline = f.row.state!.rounds[0].boards[PLAYERS[0].id].deadline!;
    vi.spyOn(Date, 'now').mockReturnValue(deadline + 1);
    const timer = vi.spyOn(globalThis, 'setTimeout');
    await recoverRun21(f.rpc, uuid(90));
    expect(f.row.state!.rounds[0].boards[PLAYERS[0].id].result).toMatchObject({reason: 'timeout', at: deadline});
    expect(f.commits).toBe(1);
    expect(timer).not.toHaveBeenCalled();
    expect(f.complete).toEqual({p_token: uuid(90), p_failure: null});
  });
  it('allows only one competing wake to claim the same work', async () => {
    const f = fixture(true);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const results = await Promise.allSettled([recoverRun21(f.rpc, uuid(90)), recoverRun21(f.rpc, uuid(90))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(f.commits).toBe(1);
  });
  it('records a failed engine/database wake instead of reporting healthy completion', async () => {
    const f = fixture(true);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const rpc: RecoveryRpc = (name, args) => name === 'run21_server_commit' ? Promise.reject(new Error('database unavailable')) : f.rpc(name, args);
    expect((await recoverRun21(rpc, uuid(90))).failures).toEqual(['run21:recovery_failed']);
    expect(f.complete?.p_failure).toBe('run21:recovery_failed');
  });
  it('preserves historical version-one turns without inventing a deadline', async () => {
    const f = fixture(false);
    vi.spyOn(Date, 'now').mockReturnValue(86_400_000);
    await recoverRun21(f.rpc, uuid(90));
    expect(f.row.state!.rounds[0].boards[PLAYERS[0].id]).toMatchObject({startedAt: null, deadline: null, result: null});
    expect(f.commits).toBe(0);
  });
});
