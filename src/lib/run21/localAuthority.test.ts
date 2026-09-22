// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest';
import {Run21Authority, type StoredMatch, type Store} from '../../../server/run21/authority';
import {fixtureDeck, IDENTITY, PLAYERS, uuid} from './fixtures';
import {chooseAction} from './bot';
import {project} from './engine';
import type {Command, Intent} from './model';

const workers: Run21Authority[] = [];
afterEach(() => workers.splice(0).forEach(w => w.dispose()));
function fixture(botFirst = false) {
  let now = 1000;
  let row: StoredMatch = {dealer_game_id: IDENTITY.dealerGameId, game_id: IDENTITY.sessionId, first_round_id: uuid(20), dealer_user_id:uuid(botFirst?30:31),
    participants: PLAYERS.map((p, i) => ({...p, userId: uuid(30 + i), chips: 0})), stake: 5, balances: {[PLAYERS[0].id]: 0, [PLAYERS[1].id]: 0},
    revision: 0, state: null, bot_due_at: null, finished: false};
  // Deliberately opposite seat order: the persisted dealer identity must decide.
  if (!botFirst) row.participants.reverse();
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
  it('admits only the human starter without a clock; rejects outsiders and an impersonated actor', async () => {
    const f = fixture(), a = f.make();
    await expect(a.read(game, uuid(99))).rejects.toThrow('participant_required'); expect(f.row.state).toBeNull();
    const result = await a.read(game, user);
    expect(result.view.active_player_id).toBe(human);
    expect(result.view.boards[human]?.current).toBeTruthy(); expect(result.view.boards[human]?.deadline).toBeNull();
    expect(f.row.state!.rounds[0].boards[PLAYERS[1].id]).toMatchObject({current:null,startedAt:null,deadline:null,presented:[]});
    expect(f.row.bot_due_at).toBeNull();
    expect(result.view.boards[PLAYERS[1].id]).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret'); expect(JSON.stringify(result)).not.toContain('salt');
    await expect(a.act(game, user, {...command(f.row, {type: 'place', column: 0}), playerId: PLAYERS[1].id})).rejects.toThrow('unauthorized');
  });
  it('persists exactly one pass under duplicate requests without starting the clock, including reconnect', async () => {
    const f = fixture(), a = f.make(); await a.read(game, user);
    const cmd = command(f.row, {type: 'pass'});
    const outcomes = await Promise.all([a.act(game, user, cmd), a.act(game, user, cmd)]);
    expect(outcomes.map(r => r.status)).toEqual(['accepted', 'duplicate']);
    expect(f.row.state!.rounds[0].boards[human].passesUsed).toBe(1);
    expect(f.row.state!.rounds[0].boards[human].deadline).toBeNull();
    a.dispose(); f.tick(10000);
    const reconnect=f.make();
    expect((await reconnect.read(game,user)).view.boards[human]).toMatchObject({passesUsed:1,startedAt:null,deadline:null});
    await expect(a.act(game, user, command(f.row, {type: 'pass'}))).rejects.toThrow('pass_used');
    await expect(a.act(game, user, command(f.row, {type: 'collect'}))).rejects.toThrow('collect_unavailable');
    await a.act(game, user, command(f.row, {type: 'place', column: 0}));
    expect(f.row.state!.rounds[0].boards[human].deadline).toBe(261000);
    expect((await a.history(game, user))[0].events.filter(e => e.actorId === PLAYERS[1].id).length).toBe(0);
  });
  it('recovers a missed deadline from persisted state with zero score and no forged clock', async () => {
    const f = fixture(), a = f.make(); await a.read(game, user); await a.act(game, user, command(f.row, {type: 'place', column: 0}));
    const deadline = f.row.state!.rounds[0].boards[human].deadline; a.dispose(); f.tick(251000);
    const restarted = f.make(); await restarted.recover();
    expect(f.row.state!.rounds[0].boards[human].result).toMatchObject({reason: 'timeout', at: deadline, score: 0});
    expect((await restarted.read(game, user)).view.boards[human]?.result?.reason).toBe('timeout');
    expect(f.row.state!.rounds[0].active_player_id).toBeNull();
    expect(f.row.state!.rounds[0].scorePresentation).toMatchObject({startedAt:252000,endsAt:257000});
    expect(f.row.state!.rounds[0].boards[PLAYERS[1].id]).toMatchObject({startedAt:null,deadline:null,current:null});
    expect(f.row.state!.rounds[0].revealed).toBe(false);
    const frozen = JSON.stringify(f.row.state!.rounds[0].boards[human]);
    f.tick(1000); await restarted.read(game, user);
    expect(JSON.stringify(f.row.state!.rounds[0].boards[human])).toBe(frozen);
    f.tick(4000); await restarted.read(game,user);
    expect(f.row.state!.rounds[0].active_player_id).toBe(PLAYERS[1].id);
    expect(f.row.state!.rounds[0].boards[PLAYERS[1].id]).toMatchObject({startedAt:null,deadline:null});
  });
  it('finishes the starting bot before admitting the human, rejects inactive commands, then reveals both frozen boards', async () => {
    const f = fixture(true), a = f.make(), bot = PLAYERS[1].id;
    const opening = await a.read(game, user);
    expect(opening.view.active_player_id).toBe(bot);
    expect(opening.view.boards[human]).toMatchObject({current:null,deadline:null,startedAt:null,presented:[]});
    expect(opening.view.boards[bot]?.current).toBeTruthy();
    expect(opening.view.boards[bot]?.deadline).toBeNull();
    expect(f.row.bot_due_at).toBe(1750);
    f.tick(749); await a.read(game,user); expect(f.row.state!.rounds[0].boards[bot].startedAt).toBeNull();
    f.tick(1); await Promise.all([a.read(game,user),a.read(game,user)]);
    expect(f.row.state!.events.filter(e=>e.type==='card_placed'&&e.actorId===bot)).toHaveLength(1);
    expect(f.row.bot_due_at).toBe(2500);
    const resumed=await a.read(game,user,opening.eventSequence);
    expect(resumed.events.every(e=>e.sequence>opening.eventSequence)).toBe(true);
    expect(resumed.events.filter(e=>e.type==='card_placed')).toHaveLength(1);
    for (const intent of [{type:'place',column:0},{type:'pass'},{type:'collect'}] as Intent[])
      await expect(a.act(game,user,command(f.row,intent))).rejects.toThrow('not_your_turn');
    expect(f.row.state!.rounds[0].boards[human].revision).toBe(0);
    for(let i=0;i<100 && !f.row.state!.rounds[0].boards[bot].result;i++) {
      f.tick(450); await a.read(game,user);
    }
    const round=f.row.state!.rounds[0], completed=JSON.stringify(round.boards[bot]);
    expect(round.boards[bot].result).toBeTruthy();
    expect(round.active_player_id).toBeNull();
    expect(round.boards[human]).toMatchObject({current:null,startedAt:null,deadline:null});
    expect(round.revealed).toBe(false); expect(f.row.bot_due_at).toBeNull();
    expect((await a.read(game,user)).view.boards[bot]?.result).toBeTruthy();
    f.tick(5000); const humanTurn=await a.read(game,user);
    expect(humanTurn.view.active_player_id).toBe(human);
    expect(humanTurn.view.boards[human]).toMatchObject({current:round.boards[bot].presented[0],startedAt:null,deadline:null});
    await a.act(game,user,command(f.row,{type:'place',column:0}));
    expect(JSON.stringify(f.row.state!.rounds[0].boards[bot])).toBe(completed);
    f.tick(250000); expect((await a.read(game,user)).view.revealed).toBe(false);
    f.tick(5000); const nextRound=await a.read(game,user);
    expect(f.row.state!.rounds[0].revealed).toBe(true);
    expect(nextRound.view.roundNumber).toBe(2);expect(nextRound.view.active_player_id).toBe(bot);
    expect(nextRound.view.boards[human]).toMatchObject({startedAt:null,deadline:null,columns:[[],[],[],[],[]]});
    expect(JSON.stringify(f.row.state!.rounds[0].boards[bot])).toBe(completed);
    expect(f.row.state!.events.filter(e=>e.type==='round_revealed')).toHaveLength(1);
    expect(f.row.state!.rounds[1].active_player_id).toBe(bot);
    expect(JSON.stringify(f.row.state!.rounds[0].boards[bot])).toBe(completed);
  });
  it.each([false,true])('preserves non-dealer order through three rounds, receipt and replay (human dealer: %s)', async (botFirst) => {
    const f = fixture(botFirst), a = f.make(); await a.read(game, user);
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
    expect(f.row.state?.events.filter(e=>e.type==='turn_started').slice(0,6).map(e=>e.frame.active_player_id)).toEqual(Array.from({length:3},()=>botFirst?[PLAYERS[1].id,human]:[human,PLAYERS[1].id]).flat());
    expect(f.row.state?.rounds.length).toBeGreaterThanOrEqual(3); expect(f.row.state?.settlement).toBeTruthy();
    expect(f.row.state?.events.filter(e => e.type === 'settlement_recorded')).toHaveLength(1);
    const receipt = f.row.state!.settlement;
    await a.read(game, user); await a.read(game, user); expect(f.row.state!.settlement).toEqual(receipt);
    const history = (await a.history(game, user))[0]; expect(history.replay?.steps.length).toBe(history.events.length);
    expect(history.events.at(-1)?.frame.settlement).toEqual(receipt);
  }, 60000);
});
