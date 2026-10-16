// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {playerRoundDecks} from '../../../server/run21/harness';
import {act,fixtureDeck,fixtureMatch,IDENTITY,PLAYERS,uuid} from './fixtures';
import {advanceScorePresentation,createMatch,deckForPlayer,prepareRound,project} from './engine';
import {commitmentFor,shuffleRound} from './shuffle.server';
import {DEFAULT_CONFIG,type Match} from './model';
import {standardDeck,cardKey} from './rules';
import {exportReplay,visibleHistory} from './history';
const [a,b]=PLAYERS.map(p=>p.id),roundId=uuid(700);
const supplied=[fixtureDeck([{rank:'2',suit:'hearts'}],12),fixtureDeck([{rank:'K',suit:'spades'}],34)];
async function prepared() {
 const shuffle=vi.fn().mockResolvedValueOnce(supplied[0]).mockResolvedValueOnce(supplied[1]);
 const evidence=await playerRoundDecks(IDENTITY,roundId,PLAYERS,undefined,shuffle);
 const match=prepareRound(createMatch(IDENTITY,PLAYERS,1,DEFAULT_CONFIG,0),roundId,null,evidence,0);
 return {shuffle,evidence,match};
}
describe('independent immutable player decks',()=>{
 it('invokes the shuffle independently with each authoritative player identity before either turn',async()=>{
  const {shuffle,evidence,match}=await prepared();
  expect(shuffle.mock.calls).toEqual([[IDENTITY,roundId,a],[IDENTITY,roundId,b]]);
  for(const [i,p] of PLAYERS.entries()) {
   const deck=deckForPlayer(match,match.rounds[0],p.id);
   expect(deck.cards).toEqual(supplied[i].cards);
   expect(deck.cards).not.toBe(supplied[i].cards);
   expect(deck.cards.map(cardKey).sort()).toEqual(standardDeck().map(cardKey).sort());
   expect(evidence.decks[p.id]).toMatchObject({identity:IDENTITY,playerId:p.id,roundId});
  }
  expect(match.rounds[0].boards[b].presented).toEqual([]);
 });
 it('uses CSPRNG per player and binds commitments to player, round, match and hand',async()=>{
  for(const id of [a,b]) {
   const deck=await shuffleRound(IDENTITY,roundId,id);
   expect(new Set(deck.cards.map(cardKey)).size).toBe(52);
   expect(deck.commitment).toBe(await commitmentFor(IDENTITY,roundId,deck,id));
   for(const [identity,round,player] of [[IDENTITY,roundId,id===a?b:a],[IDENTITY,uuid(701),id],
    [{...IDENTITY,dealerGameId:uuid(702)},roundId,id],[{...IDENTITY,handNumber:2},roundId,id]] as const)
    expect(await commitmentFor(identity,round,deck,player)).not.toBe(deck.commitment);
  }
 });
 it('advances only the acting cursor and hands off exclusively to the second player deck',async()=>{
  let {match}=await prepared();
  match=act(match,a,{type:'ready'},0);
  expect(match.rounds[0].boards[a].current).toEqual(supplied[0].cards[0]);
  const second=structuredClone(match.rounds[0].boards[b]);
  match=act(match,a,{type:'pass'},1);
  expect(match.rounds[0].boards[a].current).toEqual(supplied[0].cards[1]);
  expect(match.rounds[0].boards[a].cardIndex).toBe(1);
  expect(match.rounds[0].boards[b]).toEqual(second);
  match=act(match,a,{type:'collect'},2);
  match=advanceScorePresentation(match,5002);
  expect(match.rounds[0].boards[b].current).toEqual(supplied[1].cards[0]);
  expect(match.rounds[0].boards[b].cardIndex).toBe(0);
 });
 it('rejects swapped player, round and match evidence and invalid decks',async()=>{
  const {evidence}=await prepared();
  for(const corrupt of [
   (e:typeof evidence)=>{[e.decks[a],e.decks[b]]=[e.decks[b],e.decks[a]];},
   (e:typeof evidence)=>{e.decks[a].roundId=uuid(703);},
   (e:typeof evidence)=>{e.decks[a].identity.dealerGameId=uuid(703);},
   (e:typeof evidence)=>{e.decks[a].cards[0]=e.decks[a].cards[1];},
   (e:typeof evidence)=>{delete e.decks[b];},
  ]) {
   const bad=structuredClone(evidence);corrupt(bad);
   expect(()=>prepareRound(createMatch(IDENTITY,PLAYERS,1,DEFAULT_CONFIG,0),roundId,null,bad,0)).toThrow();
  }
  const {match}=await prepared();const round=match.rounds[0];
  if('version' in round.secret)round.secret.decks[a].playerId=b;
  expect(()=>act(match,a,{type:'ready'},0)).toThrow('deck_identity_conflict');
 });
 it('keeps evidence byte-for-byte across serialized restart during either turn and duplicate preparation',async()=>{
  let {match,evidence}=await prepared();const frozen=JSON.stringify(match.rounds[0].secret);
  expect(prepareRound(match,roundId,null,evidence,0)).toBe(match);
  match=act(match,a,{type:'ready'},0);match=act(match,a,{type:'pass'},1);
  match=JSON.parse(JSON.stringify(match)) as Match;
  expect(deckForPlayer(match,match.rounds[0],a).cards[1]).toEqual(match.rounds[0].boards[a].current);
  match=act(match,a,{type:'collect'},2);match=advanceScorePresentation(match,5002);
  match=JSON.parse(JSON.stringify(match)) as Match;match=act(match,b,{type:'pass'},5003);
  expect(match.rounds[0].boards[b].current).toEqual(supplied[1].cards[1]);
  expect(JSON.stringify(match.rounds[0].secret)).toBe(frozen);
  const changed=structuredClone(evidence);changed.decks[a].salt='a'.repeat(64);
  expect(()=>prepareRound(match,roundId,null,changed,5003)).toThrow('round_identity_conflict');
 });
 it('prepares two fresh evidence objects and shuffle calls for each succeeding round',async()=>{
  let {match}=await prepared();const frozen=JSON.stringify(match.rounds[0].secret);
  const shuffle=vi.fn(async()=>fixtureDeck());
  for(let n=1;n<=3;n++) {
   const r=match.rounds.at(-1)!;
   if(!r.boards[a].presented.length)match=act(match,a,{type:'ready'},match.updatedAt);
   for(const id of [a,b]) {match=act(match,id,{type:'collect'},match.updatedAt);match=advanceScorePresentation(match,match.updatedAt+5000);}
   for(const id of [a,b])match=act(match,id,{type:'acknowledge'},match.updatedAt);
   const next=uuid(700+n),evidence=await playerRoundDecks(IDENTITY,next,PLAYERS,undefined,shuffle);
   match=prepareRound(match,next,r.id,evidence,match.updatedAt);
   for(const id of [a,b])expect(evidence.decks[id].roundId).toBe(next);
  }
  expect(shuffle).toHaveBeenCalledTimes(6);
  expect(JSON.stringify(match.rounds[0].secret)).toBe(frozen);
 });
 it('never projects private decks, salts or unpresented cards into live history or replay',async()=>{
  let {match}=await prepared();match=act(match,a,{type:'ready'},0);
  for(const viewer of [a,b,null]) {
   const payload=JSON.stringify([project(match,viewer),visibleHistory(match,viewer),exportReplay(match,viewer)]);
   expect(payload).not.toMatch(/"secret"|"salt"|"decks"|"cards":\[/);
   expect(payload).not.toContain(JSON.stringify(supplied[1].cards[0]));
  }
 });
 it('loads and replays old single-deck evidence without upgrading commitments or earlier events',()=>{
  let legacy=fixtureMatch();legacy=act(legacy,a,{type:'ready'},0);
  const events=JSON.stringify(legacy.events),secret=JSON.stringify(legacy.rounds[0].secret);
  const before=JSON.stringify(exportReplay(legacy,a));legacy=JSON.parse(JSON.stringify(legacy));
  expect(JSON.stringify(exportReplay(legacy,a))).toBe(before);
  legacy=act(legacy,a,{type:'collect'},1);legacy=advanceScorePresentation(legacy,5001);
  expect(JSON.stringify(legacy.rounds[0].secret)).toBe(secret);
  expect(JSON.stringify(legacy.events.slice(0,JSON.parse(events).length))).toBe(events);
  expect(legacy.dealingVersion).toBeUndefined();
 });
});
