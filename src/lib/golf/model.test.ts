import {describe,it,expect} from 'vitest';
import {golfSnapshot,acceptGolfSnapshot,golfWarning,golfCard,type GolfSnapshot} from './model';
const fixture=()=>({identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},rules:{version:'six-card-golf/1'},revision:3,serverAt:10,viewerId:'a',settlement:null,
 players:[{id:'a',chips:100},{id:'b',chips:100}],tableaus:{a:{cards:[null,null,null,null,null,null],exposed:[false,false,false,false,false,false]},b:{cards:[0,null,null,null,null,null],exposed:[true,false,false,false,false,false]}},
 financial:{balances:{a:100,b:100}},pending:null,finalReason:null,finalQueue:[],consecutiveNoRevealTurns:0,scores:{a:-2,b:4}});
describe('Golf public projection boundary',()=>{
 it.each([3,6,9,18])('retains %i holes across snapshot/reconnect',holes=>{const raw={...fixture(),rules:{version:'six-card-golf/2',holes}};const v=golfSnapshot(raw);expect(v.rules.holes).toBe(holes);expect(acceptGolfSnapshot(v,golfSnapshot(raw),'d').rules.holes).toBe(holes);});
 it('defaults only missing legacy length to nine and rejects invalid lengths',()=>{expect(golfSnapshot(fixture()).rules.holes).toBe(9);for(const holes of [null,0,4,19,3.5,'3'])expect(()=>golfSnapshot({...fixture(),rules:{version:'six-card-golf/2',holes}})).toThrow('length');});
 it('accepts only explicitly public opponent draws while preserving concealed tableau validation',()=>{
  const raw={...fixture(),publicDraw:true,pending:{actor:'b',card:4}};
  expect(golfSnapshot(raw).pending).toEqual({actor:'b',card:4});
  expect(()=>golfSnapshot({...raw,pending:{actor:'outsider',card:4}})).toThrow('projection');
  expect(()=>golfSnapshot({...raw,pending:{actor:'b',card:52}})).toThrow('projection');
 });
 it('rejects own and opponent concealed values and another actor pending draw',()=>{
  for(const id of ['a','b'] as const){const v=fixture();v.tableaus[id].cards[1]=4;expect(()=>golfSnapshot(v)).toThrow('projection');}
  expect(()=>golfSnapshot({...fixture(),pending:{actor:'b',card:4}})).toThrow('projection');
 });
 it('preserves completed-hole negative totals without deriving a current score',()=>{
  const v=golfSnapshot(fixture());expect(v.scores).toEqual({a:-2,b:4});expect(v.tableaus.a.cards.every(c=>c===null)).toBe(true);expect(golfCard(null)).toBeUndefined();
 });
 it('rejects conflicting equal revisions and other match identities, ignores regressive frames',()=>{
  const v=golfSnapshot(fixture());expect(acceptGolfSnapshot(v,{...v,revision:2},'d')).toBe(v);
  expect(()=>acceptGolfSnapshot(v,{...v,scores:{a:99,b:4}},'d')).toThrow('conflicting');
  expect(()=>acceptGolfSnapshot(v,{...v,id:'other'},'d')).toThrow('identity');
  expect(acceptGolfSnapshot(v,{...v,serverAt:20},'d').serverAt).toBe(20);
 });
 it('warns from public completed-turn count and reports immutable queue remainder',()=>{
  const v=golfSnapshot(fixture());expect(golfWarning(v)).toBeNull();
  expect(golfWarning({...v,consecutiveNoRevealTurns:8})).toContain('2 completed turns');
  expect(golfWarning({...v,finalReason:'prolonged_play',finalQueue:['b']} as GolfSnapshot)).toBe('Final turns: 1 remaining');
 });
 it('accepts /2 and warns only on its public pending-draw threshold',()=>{
  const v=golfSnapshot({...fixture(),rules:{version:'six-card-golf/2'},consecutiveNoRevealTurns:999,stockCount:3,hasPending:true});
  expect(golfWarning(v)).toBeNull();expect(golfWarning({...v,stockCount:2})).toBe('Finish this turn · then one final turn each.');
  expect(golfWarning({...v,stockCount:1})).toBeNull();expect(golfWarning({...v,stockCount:2,hasPending:false})).toBeNull();
  expect(golfWarning({...v,finalReason:'stock_threshold',finalQueue:['a','b']})).toBe('Final turns: 2 remaining');
  expect(()=>golfSnapshot({...fixture(),rules:{version:'six-card-golf/3'}})).toThrow('identity');
 });
});

it('uses durable bot aliases consistently without renumbering by viewer position',()=>{
 const raw=fixture();const players=[{...raw.players[0],userId:'ua',name:'Bot 7-abcdef',isBot:true},{...raw.players[1],userId:'ub',name:'Human',isBot:false}];
 expect(golfSnapshot({...raw,players}).players.map(p=>p.name)).toEqual(['Bot7','Human']);expect(golfSnapshot({...raw,players:[...players].reverse()}).players.map(p=>p.name)).toEqual(['Human','Bot7']);
});
