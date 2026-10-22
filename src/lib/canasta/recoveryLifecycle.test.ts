import {describe,it,expect} from 'vitest';
import {createMatch,startHand,expire,takeControl,execute,project,assertConservation,type Command} from './engine';
import {fixtureDeck} from './rules';
import {chooseBotAction} from './bot';
const id=(n:number)=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base=()=>startHand(createMatch({id:id(5),sessionId:id(6),stake:10,realMoney:false,seats:[
 {id:id(1),userId:id(3),kind:'human',seat:1},{id:id(2),userId:id(4),kind:'human',seat:5}]},0),id(7),fixtureDeck(),0);
describe('Canasta timeout control',()=>{
 it('uses the same private-information bot policy after expiry',()=>{
  const m=base();let expected=m;
  for(let i=0;i<2;i++){
   const h=expected.hand!,action=chooseBotAction(project(expected,h.active))!;
   expected=execute(expected,{matchId:m.id,handId:h.id,turn:h.turn,generation:h.generation,revision:expected.revision,
    requestId:id(100+i),playerId:h.active,action},{kind:'service'},120000-2+i).state;
  }
  const actual=expire(m,120000,[id(1)]);
  expect(actual.hand!.players).toEqual(expected.hand!.players);expect(actual.hand!.pile).toEqual(expected.hand!.pile);
  expect(actual.automatic).toEqual([id(2)]);assertConservation(actual);
 });
 it('marks the last fake-money human automatic then pauses without playing their turn',()=>{
  const m=base();m.automatic=[id(1)];const p=expire(m,120000,[]);
  expect(p.automatic).toEqual([id(1),id(2)]);expect(p.pause?.reason).toBe('inactivity');expect(p.hand).toEqual(m.hand);
  const back=takeControl(p,id(2),{kind:'human',userId:id(4)},120001);
  expect(back.automatic).toEqual([id(1)]);expect(back.pause).toEqual(p.pause);expect(back.hand!.deadline).toBe(p.hand!.deadline);
 });
 it('keeps real-money expiry paused without bot actions or automatic status',()=>{
  const m=base();m.realMoney=true;const p=expire(m,120000,[id(1)]);
  expect(p.automatic).toEqual([]);expect(p.hand).toEqual(m.hand);expect(p.pause?.reason).toBe('inactivity');
 });
 it('fences manual commands until reclaim, and keeps the existing deadline',()=>{
  const m=base();m.automatic=[id(2)];const h=m.hand!;
  const c:Command={matchId:m.id,handId:h.id,turn:h.turn,generation:h.generation,revision:m.revision,requestId:id(50),playerId:id(2),action:{type:'draw'}};
  expect(()=>execute(m,c,{kind:'human',userId:id(4)},1)).toThrow('automatic_control');
  expect(()=>takeControl(m,id(2),{kind:'human',userId:id(3)},1)).toThrow('unauthorized');
  const back=takeControl(m,id(2),{kind:'human',userId:id(4)},1);
  expect(back.hand).toEqual(m.hand);expect(back.automatic).toEqual([]);
  expect(()=>execute(back,c,{kind:'human',userId:id(4)},2)).toThrow('stale_command');
  expect(execute(back,{...c,revision:back.revision},{kind:'human',userId:id(4)},2).state.hand!.phase).toBe('meld');
 });
});
