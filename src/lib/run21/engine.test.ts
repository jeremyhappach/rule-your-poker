import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type Card, type Command, type Config } from './model';
import { act, fixtureDeck, fixtureMatch, IDENTITY, PLAYERS, simulateRound, uuid } from './fixtures';
import { applyCommand, prepareRound, project, recordSettlement, settlementIntent } from './engine';
import { aggregate, duration, RANKS, speedAt, total, multiplierAt, standardDeck } from './rules';
import { chooseAction } from './bot';
import { exportReplay, seekReplay, visibleHistory } from './history';
import { commitmentFor, shuffleRound } from './shuffle.server';
import { reconstructReplayV1, reconstructReplayPrefixV1 } from '../replay/contractV1';
const [a, b] = PLAYERS.map(p => p.id);
const cards = (...ranks: Card['rank'][]): Card[] => ranks.map((rank, i) => ({rank, suit: ['hearts','diamonds','clubs','spades'][Math.floor(i / 13)] as Card['suit']}));
const ready = (m = fixtureMatch()) => act(m, m.rounds.at(-1)!.active_player_id!, {type: 'ready'}, m.updatedAt);
function command(m: ReturnType<typeof fixtureMatch>, intent: Command['intent'], playerId = a): Command {
  const r = m.rounds.at(-1)!;
  return {identity: IDENTITY, roundId: r.id, playerId, requestId: uuid(999), revision: r.boards[playerId].revision, intent};
}
describe('Run21 rules', () => {
  it('exhausts every rank sequence through four cards against an independent Ace oracle', () => {
    for (let length = 0; length <= 4; length++) for (let encoded = 0; encoded < 13 ** length; encoded++) {
      let value = encoded; const hand: Card[] = [];
      for (let i = 0; i < length; i++) { hand.push({rank: RANKS[value % 13], suit: 'hearts'}); value = Math.floor(value / 13); }
      const sums = hand.reduce<number[]>((possible, c) => possible.flatMap(n => c.rank === 'A' ? [n + 1, n + 11] : [n + (Number(c.rank) || 10)]), [0]);
      const safe = sums.filter(n => n <= 21);
      expect(total(hand, 21).value).toBe(safe.length ? Math.max(...safe) : Math.min(...sums));
    }
  });
  it('leaves J+A playable and locks J+A+10', () => {
    expect(total(cards('J','A'), 21)).toMatchObject({value: 21, elevated: 1, complete: false});
    expect(total(cards('J','A','10'), 21)).toMatchObject({value: 21, elevated: 0, complete: true});
    expect(total(cards('A','A','9'), 21).value).toBe(21);
  });
  it.each([[96,0],[97,50],[98,100],[99,150],[100,200],[101,250],[102,300],[103,400],[104,500],[105,1000]])('scores %i as %i', (n, score) => {
    expect(multiplierAt(n, DEFAULT_CONFIG)).toBe(score);
  });
  it('uses configured speed and deadline boundaries', () => {
    const board = act(ready(),a,{type:'place',column:0},0).rounds[0].boards[a];
    for (const [at, speed] of [[0,250],[99,250],[100,249],[24999,1],[25000,0],[100000,0]]) expect(speedAt(board, DEFAULT_CONFIG, at)).toBe(speed);
    const config = {...DEFAULT_CONFIG, speed: {start: 7, decrement: 2, intervalMs: 30}};
    expect(duration(config)).toBe(120);
    expect(speedAt(board, config, 90)).toBe(1);
  });
});
describe('Run21 authority specification', () => {
  it('admits one timed board and transfers the same first card only after completion', () => {
    let m=fixtureMatch(); expect(m.rounds[0].boards[a].deadline).toBeNull();
    m=act(m,a,{type:'ready'},10000);
    const first=m.rounds[0].boards[a].current;
    expect(m.rounds[0].boards[a]).toMatchObject({startedAt:10000,deadline:35000});
    expect(m.rounds[0].boards[b]).toMatchObject({current:null,startedAt:null,deadline:null});
    expect(chooseAction(project(m,b),10000)).toBeNull();
    m=act(m,a,{type:'expire'},35000);
    expect(m.rounds[0].active_player_id).toBe(b);
    expect(m.rounds[0].boards[b]).toMatchObject({current:first,startedAt:35000,deadline:60000});
    expect(m.rounds[0].revealed).toBe(false);
  });
  it('starts the clock on admission and never resets it on pass or placement',()=>{
    let m=ready();const initial=m.rounds[0].boards[a].current;
    expect(applyCommand(m,command(m,{type:'place',column:5}),{kind:'player',playerId:a},100).reason).toBe('column_locked');
    expect(applyCommand(m,command(m,{type:'expire'}),{kind:'service'},100).reason).toBe('before_deadline');
    expect(applyCommand(m,command(m,{type:'ready'}),{kind:'player',playerId:a},100).reason).toBe('already_ready');
    m=act(m,a,{type:'pass'},100);
    expect(m.rounds[0].boards[a]).toMatchObject({startedAt:0,deadline:25000});
    expect(m.rounds[0].boards[a].current).not.toEqual(initial);
    const upcard=m.rounds[0].boards[a].current,c=command(m,{type:'place',column:2});
    const placed=applyCommand(m,c,{kind:'player',playerId:a},200);
    expect(placed.status).toBe('accepted');m=placed.state;
    expect(m.rounds[0].boards[a]).toMatchObject({startedAt:0,deadline:25000,columns:[[],[],[upcard],[],[]]});
    expect(applyCommand(m,c,{kind:'player',playerId:a},300)).toMatchObject({status:'duplicate',state:m});
    const replay=exportReplay(m,a),index=replay.steps.findIndex(s=>s.substeps[0]?.type==='turn_started');
    expect(seekReplay(replay,index-1).boards[a]!.deadline).toBeNull();
    expect(seekReplay(replay,index).boards[a]!.deadline).toBe(25000);
    m=act(m,a,{type:'expire'},25000);
    expect(m.rounds[0].boards[a].result).toMatchObject({reason:'timeout',at:25000});
    expect(m.rounds[0].boards[b].deadline).toBe(50000);
  });
  it('does not mutate inputs; duplicate/stale/rejected actions never consume a card', () => {
    const m = ready(); const frozen = JSON.stringify(m); const c = command(m, {type:'place',column:0});
    const next = applyCommand(m,c,{kind:'player',playerId:a},100);
    expect(JSON.stringify(m)).toBe(frozen);
    expect(next.status).toBe('accepted');
    expect(applyCommand(next.state,c,{kind:'player',playerId:a},200)).toMatchObject({status:'duplicate',state:next.state});
    expect(applyCommand(next.state,{...c, requestId:uuid(998)},{kind:'player',playerId:a},200).reason).toBe('stale_revision');
    expect(applyCommand(next.state,{...c,intent:{type:'pass'}},{kind:'player',playerId:a},200).reason).toBe('request_conflict');
    expect(next.state.rounds[0].boards[a].cardIndex).toBe(1);
    expect(applyCommand(m,command(m,{type:'collect'}),{kind:'player',playerId:a},1).state).toBe(m);
  });
  it('separates authentication and exact identity from action operands', () => {
    const m = ready(); const c = command(m,{type:'place',column:0});
    expect(applyCommand(m,c,{kind:'player',playerId:b},1).reason).toBe('unauthorized');
    expect(applyCommand(m,{...c,identity:{...IDENTITY,handNumber:2}},{kind:'player',playerId:a},1).reason).toBe('identity');
    expect(applyCommand(m,{...c,roundId:uuid(101)},{kind:'player',playerId:a},1).reason).toBe('stale_round');
    expect(applyCommand(m,command(m,{type:'expire'}),{kind:'player',playerId:a},25000).reason).toBe('unauthorized');
  });
  it('rejects non-active commands before and after the active player advances', () => {
    const m=ready(), cb=command(m,{type:'place',column:1},b);
    expect(applyCommand(m,cb,{kind:'player',playerId:b},100)).toMatchObject({state:m,status:'rejected',reason:'not_your_turn'});
    const next=act(m,a,{type:'place',column:0},100);
    expect(applyCommand(next,cb,{kind:'player',playerId:b},100)).toMatchObject({state:next,status:'rejected',reason:'not_your_turn'});
  });
  it('records only Pass used, clears current before presenting the next card, and keeps the opponent private', () => {
    let m = ready(); const card = m.rounds[0].boards[a].current;
    m = act(m,a,{type:'pass'},50);
    expect(m.rounds[0].boards[a].passesUsed).toBe(1);
    expect(m.rounds[0].boards[a]).not.toHaveProperty('discard');
    const index=m.events.findIndex(e=>e.type==='pass_used');
    expect(m.events[index].operands).toEqual({});
    expect(m.events[index].frame.boards[a].current).toBeNull();
    expect(m.events[index-1].frame.boards[a].current).toEqual(card);
    expect(m.events[index+1].type).toBe('card_presented');
    expect(m.events[index+1].frame.boards[a].current).not.toEqual(card);
    expect(applyCommand(m,command(m,{type:'pass'}),{kind:'player',playerId:a},100).reason).toBe('pass_used');
    const view = project(m,b);
    expect(view.boards[a]).toBeNull();
    expect(JSON.stringify(view)).not.toContain('salt');
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(visibleHistory(m,b).find(e => e.type === 'pass_used')).toMatchObject({operands:{},frame:{boards:{[a]:null},passUsed:{[a]:true}}});
    expect(() => project(m,uuid(500))).toThrow('unauthorized_viewer');
  });
  it('locks hard 21; a different-column bust ends the whole round with zero', () => {
    let m = ready(fixtureMatch(DEFAULT_CONFIG,cards('J','A','10','K','Q','9')));
    for (let i=0;i<3;i++) m=act(m,a,{type:'place',column:0},i+1);
    expect(applyCommand(m,command(m,{type:'place',column:0}),{kind:'player',playerId:a},4).reason).toBe('column_locked');
    for (let i=0;i<3;i++) m=act(m,a,{type:'place',column:1},i+4);
    expect(m.rounds[0].boards[a].result).toMatchObject({reason:'bust',score:0});
    expect(project(m,b).boards[a]).toBeNull();
    expect(applyCommand(m,command(m,{type:'pass'}),{kind:'player',playerId:a},9).reason).toBe('not_your_turn');
  });
  it.each([24999,25000,25001])('deterministically resolves collect versus expiration at %i', at => {
    const cfg = {...DEFAULT_CONFIG,multipliers:{11:50}};
    let m=ready(fixtureMatch(cfg,cards('A'))); m=act(m,a,{type:'place',column:0},0);
    const next=applyCommand(m,command(m,{type:'collect'}),{kind:'player',playerId:a},at).state;
    expect(next.rounds[0].boards[a].result).toMatchObject({reason:at<25000?'collect':'timeout',score:at<25000?50:0,at:Math.min(at,25000)});
    expect(applyCommand(next,{...command(next,{type:'expire'}),requestId:uuid(998)},{kind:'service'},at+1).reason).toBe('not_your_turn');
  });
  it('timeout wins placement races and reveals exactly once when both finish', () => {
    let m=ready();m=act(m,a,{type:'place',column:0},0);
    m=act(m,a,{type:'place',column:0},25000);
    expect(m.rounds[0].revealed).toBe(false);
    m=act(m,b,{type:'place',column:1},25000);m=act(m,b,{type:'expire'},50000);
    expect(m.rounds[0].boards[a].cardIndex).toBe(1);
    expect(m.events.filter(e=>e.type==='round_revealed')).toHaveLength(1);
    expect(project(m,a).boards[b]).not.toBeNull();
    const restored=JSON.parse(JSON.stringify(m)); expect(project(restored,a)).toEqual(project(m,a));
  });
  it('guarantees three rounds, repeats ties, and records one immutable stake receipt', () => {
    const cfg: Config={...DEFAULT_CONFIG,multipliers:{11:50}};
    let m=fixtureMatch(cfg,cards('A'));
    for(let round=1;round<=4;round++) {
      m=ready(m);
      for(let turn=0;turn<2;turn++) {
        const id=m.rounds.at(-1)!.active_player_id!;
        expect(m.rounds.at(-1)!.boards[id].deadline).toBe(m.updatedAt+25000);
        m=act(m,id,{type:'place',column:0},m.updatedAt);
        m=act(m,id,round===4&&id===a?{type:'collect'}:{type:'expire'},m.updatedAt+(round===4&&id===a?1:25000));
      }
      if(round<4) {
        expect(m.winnerId).toBeNull();
        const previous=m.rounds.at(-1)!.id;
        expect(()=>prepareRound(m,uuid(100+round),previous,fixtureDeck(cards('A')),m.updatedAt)).toThrow('round_boundary');
        m=act(m,a,{type:'acknowledge'},m.updatedAt);m=act(m,b,{type:'acknowledge'},m.updatedAt);
        m=prepareRound(m,uuid(100+round),previous,fixtureDeck(cards('A')),m.updatedAt);
        expect(prepareRound(m,uuid(100+round),previous,fixtureDeck(cards('A')),m.updatedAt)).toBe(m);
      }
    }
    expect(m.winnerId).toBe(a); expect(m.rounds).toHaveLength(4);
    const intent=settlementIntent(m)!; expect(intent.amount).toBe(10);
    const receipt={...intent,resultId:uuid(700),transferBatchId:uuid(701),at:m.updatedAt};
    m=recordSettlement(m,receipt);expect(recordSettlement(m,receipt)).toBe(m);
    expect(()=>recordSettlement(m,{...receipt,amount:20})).toThrow('settlement_identity');
    const replay=exportReplay(m,a);expect(reconstructReplayPrefixV1(replay).run21).toEqual(project(m,a));
    expect(()=>reconstructReplayV1(replay)).toThrow('incomplete_package');
  });
  it('binds a cryptographic shuffle commitment to the exact hand and round', async()=>{
    const deck=await shuffleRound(IDENTITY,uuid(100));
    expect(new Set(deck.cards.map(c=>`${c.rank}:${c.suit}`)).size).toBe(52);
    expect(await commitmentFor(IDENTITY,uuid(100),deck)).toBe(deck.commitment);
    expect(await commitmentFor(IDENTITY,uuid(101),deck)).not.toBe(deck.commitment);
  });
});
describe('Run21 bot and replay',()=>{
  it('is reproducible, spends time, and never reads an opponent board or future deck',()=>{
    const m=ready(); const view=project(m,a); const first=chooseAction(view,0)!;
    expect(first).toEqual(chooseAction(view,0));expect(first.delayMs).toBeGreaterThan(0);
    const poisoned={...view,boards:{...view.boards}};
    Object.defineProperty(poisoned.boards,b,{get(){throw new Error('opponent inspected');}});
    expect(chooseAction(poisoned,0)).toEqual(first);
  });
  it.each([1,2,3,4,5,6,7,8])('runs deterministic bot-vs-bot round seed %i through the human reducer',seed=>{
      const input=fixtureMatch(DEFAULT_CONFIG,[],seed);const m=simulateRound(input,seed);
      expect(m).toEqual(simulateRound(input,seed));
      expect(m.rounds[0].revealed).toBe(true);
      expect(m.updatedAt).toBeGreaterThan(0);
      for(const board of Object.values(m.rounds[0].boards)) expect(board.result).not.toBeNull();
  },15000);
  it('takes the 104 to 105 jump instead of collecting the first eligible board',()=>{
    const m=ready(); const view=project(m,a); const board=view.boards[a]!;
    board.columns=[cards('K','Q','A'),cards('K','Q','A'),cards('K','Q','A'),cards('K','Q','A'),cards('K','Q')];
    board.current={rank:'A',suit:'spades'}; expect(aggregate(board,view.config)).toBe(104);
    expect(chooseAction(view,1000)!.intent).toEqual({type:'place',column:4});
  });
  it('passes a forced bust and collects a maximum board',()=>{
    const view=project(ready(),a);const board=view.boards[a]!;
    board.startedAt=0;board.deadline=25000;
    board.columns=Array.from({length:5},()=>cards('K','9'));board.current={rank:'K',suit:'spades'};
    expect(chooseAction(view,1)!.intent).toEqual({type:'pass'});
    board.columns=Array.from({length:5},()=>cards('K','Q','A'));
    expect(chooseAction(view,1)!.intent).toEqual({type:'collect'});
  });
  it('seeks every recorded event with exact recorded score and privacy',()=>{
    let m=ready();m=act(m,a,{type:'pass'},300);
    const privateReplay=exportReplay(m,b);
    const passIndex=privateReplay.steps.findIndex(s=>s.substeps[0]?.type==='pass_used');
    expect(passIndex).toBeGreaterThan(0);
    expect(seekReplay(privateReplay,passIndex).boards[a]).toBeNull();
    expect(seekReplay(privateReplay,passIndex).passUsed[a]).toBe(true);
    expect(JSON.stringify(privateReplay)).not.toContain('salt');
    m=simulateRound(m);
    const replay=exportReplay(m,a);
    for(let i=0;i<replay.steps.length;i++) expect(seekReplay(replay,i).roundId).toBe(replay.steps[i].identity.roundId);
    expect(seekReplay(replay,replay.steps.length-1)).toEqual(project(m,a));
    expect(()=>seekReplay(replay,-1)).toThrow('invalid_seek');
  },15000);
});
