import {describe,it,expect} from 'vitest';
import {golfFlights} from './useGolfCardPresentation';
import type {GolfSnapshot} from '@/lib/golf/model';
const frame=():GolfSnapshot=>({id:'match',scope:'hole',revision:1,phase:'playing',paused:false,
 players:['a','b'].map((id,i)=>({id,userId:id,name:id,seat:i+1,isBot:false,chips:100})),pending:null,
 tableaus:Object.fromEntries(['a','b'].map(id=>[id,{cards:Array(6).fill(null),exposed:Array(6).fill(false)}])),
 stake:5,serverAt:0,viewerId:'a',identity:{sessionId:'session',dealerGameId:'match',roundId:'hole'},
 rules:{version:'six-card-golf/1',turnSeconds:30,holes:9},hole:1,dealerIndex:1,turnIndex:0,openingRemaining:0,
 scores:{a:0,b:0},holes:[],hasPending:false,stockCount:39,discardTop:0,consecutiveNoRevealTurns:0,
 finalQueue:[],finalReason:null,deadline:30000,pausedAt:null,canAct:true,finished:false,settled:false,
 settlement:null,financial:{balances:{a:100,b:100},resultId:null,batch:null}});
describe('Golf canonical card transport privacy',()=>{
 it('transports private draws as backs without rank or suit in diagnostic intents',()=>{
  const before=frame(),after={...before,revision:2,pending:{actor:'a',card:51}};
  const flights=golfFlights(before,after,'user');expect(flights).toHaveLength(1);
  expect(flights[0].face).toBe('hidden');expect(flights[0].visibleFace).toBeUndefined();
  expect(flights[0].to).toEqual({kind:'tableau',playerId:'a',index:6});
 });
 it('reveals only the newly public destination from a private draw',()=>{
  const before={...frame(),pending:{actor:'a',card:51}},after=structuredClone(before);
  after.pending=null;after.revision++;after.tableaus.a.cards[2]=51;
  const flights=golfFlights(before,after,'user');expect(flights).toHaveLength(1);
  expect(flights[0].visibleFace).toEqual({rank:'K',suit:'clubs'});
  expect(flights[0].from).toEqual({kind:'tableau',playerId:'a',index:6});
 });
 it('ignores equal, stale, paused and foreign-match frames',()=>{
  const before=frame();for(const after of [before,{...before,revision:0},{...before,revision:2,paused:true},{...before,revision:2,id:'other'}])expect(golfFlights(before,after,'user')).toEqual([]);
 });
 it('deals a new hole using twelve backs, with no concealed values',()=>{
  const before=frame(),after={...frame(),revision:2,scope:'next'};
  const flights=golfFlights(before,after,'user');expect(flights).toHaveLength(12);
  expect(flights.every(f=>f.face==='hidden'&&!f.visibleFace&&f.from.kind==='feltDealOrigin')).toBe(true);
 });
});
