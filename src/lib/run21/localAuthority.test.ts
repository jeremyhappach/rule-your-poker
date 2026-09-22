// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest';
import {Run21Authority, type StoredMatch, type Store} from '../../../server/run21/authority';
import {fixtureDeck, IDENTITY, PLAYERS, uuid} from './fixtures';
import {chooseAction} from './bot';
import {project} from './engine';
import type {Command, Intent} from './model';

const workers: Run21Authority[] = [];
afterEach(() => workers.splice(0).forEach(w => w.dispose()));
function fixture() {
  let now = 1000;
  let row: StoredMatch = {dealer_game_id: IDENTITY.dealerGameId, game_id: IDENTITY.sessionId, first_round_id: uuid(20),
    participants: PLAYERS.map((p, i) => ({...p, userId: uuid(30 + i), chips: 0})), stake: 5, balances: {[PLAYERS[0].id]: 0, [PLAYERS[1].id]: 0},
    revision: 0, state: null, bot_due_at: null, finished: false};
  const store: Store = {load: async () => [structuredClone(row)], commit: async (old, state, due) => {
    if (old.revision !== row.revision) throw Error('CAS conflict');
    row = {...row, state: structuredClone(state), revision: row.revision + 1, bot_due_at: due}; return structuredClone(row);
  }, close: async () => {row.finished = true;}};
  const make = () => {const w = new Run21Authority(store, () => now, async () => fixtureDeck([], 17)); workers.push(w); return w;};
  return {make, get row() {return row;}, tick: (ms: number) => {now += ms;}};
}
const game = IDENTITY.sessionId, user = uuid(30), human = PLAYERS[0].id;
let sequence = 100;
function command(row: StoredMatch, intent: Intent): Command {
  const state = row.state!, round = state.rounds.at(-1)!;
  return {identity: state.identity, roundId: round.id, playerId: human, requestId: uuid(sequence++), revision: round.boards[human].revision, intent};
}
describe('persisted local Run21 authority', () => {
  it('opens one playable card without a clock; rejects outsiders and an impersonated actor', async () => {
    const f = fixture(), a = f.make();
    await expect(a.read(game, uuid(99))).rejects.toThrow('participant_required'); expect(f.row.state).toBeNull();
    const result = await a.read(game, user);
    expect(result.view.boards[human]?.current).toBeTruthy(); expect(result.view.boards[human]?.deadline).toBeNull();
    expect(result.view.boards[PLAYERS[1].id]).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret'); expect(JSON.stringify(result)).not.toContain('salt');
    await expect(a.act(game, user, {...command(f.row, {type: 'place', column: 0}), playerId: PLAYERS[1].id})).rejects.toThrow('unauthorized');
  });
  it('persists exactly one pass under concurrent duplicate requests and starts the deadline only on placement', async () => {
    const f = fixture(), a = f.make(); await a.read(game, user);
    const cmd = command(f.row, {type: 'pass'});
    const outcomes = await Promise.all([a.act(game, user, cmd), a.act(game, user, cmd)]);
    expect(outcomes.map(r => r.status)).toEqual(['accepted', 'duplicate']);
    expect(f.row.state!.rounds[0].boards[human].passesUsed).toBe(1);
    expect(f.row.state!.rounds[0].boards[human].deadline).toBeNull();
    await expect(a.act(game, user, command(f.row, {type: 'pass'}))).rejects.toThrow('pass_used');
    await expect(a.act(game, user, command(f.row, {type: 'collect'}))).rejects.toThrow('collect_unavailable');
    await a.act(game, user, command(f.row, {type: 'place', column: 0}));
    expect(f.row.state!.rounds[0].boards[human].deadline).toBe(26000);
    expect((await a.history(game, user))[0].events.filter(e => e.actorId === PLAYERS[1].id).length).toBe(0);
  });
  it('recovers a missed deadline from persisted state with zero score and no forged clock', async () => {
    const f = fixture(), a = f.make(); await a.read(game, user); await a.act(game, user, command(f.row, {type: 'place', column: 0}));
    const deadline = f.row.state!.rounds[0].boards[human].deadline; a.dispose(); f.tick(26000);
    const restarted = f.make(); await restarted.recover();
    expect(f.row.state!.rounds[0].boards[human].result).toMatchObject({reason: 'timeout', at: deadline, score: 0});
    expect((await restarted.read(game, user)).view.boards[human]?.result?.reason).toBe('timeout');
  });
  it('runs the real bot, three rounds, receipt and replay through the same persisted state', async () => {
    const f = fixture(), a = f.make(); await a.read(game, user);
    let i = 0;
    while (!f.row.state?.settlement && i++ < 2000) {
      f.tick(450); await a.read(game, user);
      const state = f.row.state!, round = state.rounds.at(-1)!;
      if (round.revealed && !state.winnerId) await a.act(game, user, command(f.row, {type: 'acknowledge'}));
      else if (!round.boards[human].result) {
        const action = chooseAction(project(state, human), state.updatedAt, {seed: 123, minActionMs: 220, maxActionMs: 420});
        if (action) await a.act(game, user, command(f.row, action.intent));
      }
    }
    expect(f.row.state?.rounds.length).toBeGreaterThanOrEqual(3); expect(f.row.state?.settlement).toBeTruthy();
    expect(f.row.state?.events.filter(e => e.type === 'settlement_recorded')).toHaveLength(1);
    const receipt = f.row.state!.settlement;
    await a.read(game, user); await a.read(game, user); expect(f.row.state!.settlement).toEqual(receipt);
    const history = (await a.history(game, user))[0]; expect(history.replay?.steps.length).toBe(history.events.length);
    expect(history.events.at(-1)?.frame.settlement).toEqual(receipt);
  }, 60000);
});
