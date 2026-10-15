import {describe, expect, it} from 'vitest';
import {act, fixtureMatch, PLAYERS, uuid} from './fixtures';
import {advanceScorePresentation, applyCommand, project} from './engine';
import {DEFAULT_CONFIG, type Card, type Command} from './model';
import {aggregate, standardDeck} from './rules';

const actor = PLAYERS[0].id;
function boundary(groups: Card['rank'][][], config = DEFAULT_CONFIG) {
  const deck = standardDeck();
  const cards = groups.flatMap(ranks => ranks.map(rank => deck.splice(deck.findIndex(card => card.rank === rank), 1)[0]));
  const columns = groups.flatMap((ranks, column) => ranks.map(() => column));
  let state = act(fixtureMatch(config, cards), actor, {type:'ready'}, 0);
  for (const column of columns.slice(0, -1)) state = act(state, actor, {type:'place', column}, state.updatedAt + 100);
  const round = state.rounds[0];
  const command: Command = {identity: state.identity, roundId: round.id, playerId: actor, requestId: uuid(9000),
    revision: round.boards[actor].revision, intent: {type:'place', column: columns.at(-1)!}};
  return {state, command};
}
const aces: Card['rank'][][] = [['A','K'],['A','Q'],['A','J'],['A','10'],['9','7','5']];
describe('perfect placement is the successful board finish', () => {
  it.each([{groups:aces}, {groups:[['7','7','7'],['8','8','5'],['9','9','3'],['10','10','A'],['K','Q','A']] as Card['rank'][][]}])('accepts legal combinations without another card or Collect request', ({groups}) => {
    const {state, command} = boundary(groups);
    const accepted = applyCommand(state, command, {kind:'player',playerId:actor}, 2100);
    const next = accepted.state, board = next.rounds[0].boards[actor];
    expect(accepted.status).toBe('accepted');
    expect(board.result).toMatchObject({reason:'collect',aggregate:105,multiplier:1000,speed:248,score:248000,at:2100});
    expect(board.current).toBeNull();
    expect(board.presented).toHaveLength(groups.flat().length);
    expect(next.events.slice(state.events.length).map(e=>e.type)).toEqual(['card_placed','collect','score_presentation_started']);
    expect(next.cumulative[actor]).toBe(248000);
    expect(applyCommand(next, command, {kind:'player',playerId:actor}, 2200)).toMatchObject({status:'duplicate',state:next});
    expect(applyCommand(next, {...command,requestId:uuid(9001)}, {kind:'service'}, 2200).status).toBe('rejected');
    // A persisted reconnect and zero-client recovery use the same score hold.
    const restored = JSON.parse(JSON.stringify(next));
    expect(project(restored,actor).scorePresentation?.endsAt).toBe(7100);
    expect(advanceScorePresentation(restored,7099)).toBe(restored);
    const continued=advanceScorePresentation(restored,7100);
    expect(continued.rounds[0].active_player_id).toBe(PLAYERS[1].id);
    expect(continued.cumulative[actor]).toBe(248000);
    expect(continued.winnerId).toBeNull();
  });
  it('leaves 104 actionable', () => {
    const {state,command}=boundary([...aces.slice(0,4),['9','7','4']]);
    const board=applyCommand(state,command,{kind:'service'},2100).state.rounds[0].boards[actor];
    expect(aggregate(board,DEFAULT_CONFIG)).toBe(104);expect(board.result).toBeNull();expect(board.current).not.toBeNull();
  });
  it('requires qualification at the configured ceiling', () => {
    const {state,command}=boundary(aces,{...DEFAULT_CONFIG,multipliers:{104:500}});
    expect(applyCommand(state,command,{kind:'service'},2100).state.rounds[0].boards[actor].result).toBeNull();
  });
  it('gives bust and the authoritative timeout precedence', () => {
    const bust=boundary([...aces.slice(0,4),['9','7','6']]);
    expect(applyCommand(bust.state,bust.command,{kind:'service'},2100).state.rounds[0].boards[actor].result).toMatchObject({reason:'bust',score:0});
    const {state,command}=boundary(aces),deadline=state.rounds[0].boards[actor].deadline!;
    const expired=applyCommand(state,command,{kind:'service'},deadline).state;
    expect(expired.rounds[0].boards[actor].result).toMatchObject({reason:'timeout',score:0});
    expect(expired.events.slice(state.events.length).some(e=>e.type==='card_placed')).toBe(false);
    expect(applyCommand(expired,command,{kind:'service'},deadline+1).status).toBe('duplicate');
  });
});
