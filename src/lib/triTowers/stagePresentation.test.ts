import {describe,it,expect} from 'vitest';
import {create,reduce,project} from './referenceEngine';
import {stagePresentation} from './stagePresentation';
const deck=Array.from({length:52},(_,i)=>i);
const fresh=()=>reduce(create({sessionId:'s',dealerGameId:'d',roundId:'r'},[{id:'a',userId:'u',seat:1,name:'A'},{id:'b',userId:'v',seat:2,name:'B'}],deck,0),{type:'start'},1,()=>deck);
describe('authoritative stage results',()=>{
 it.each([1,2,3])('holds stage %i for five seconds, including terminal stages',stage=>{
  let s=fresh();s.stage=stage;s.score=63000;s.stages=stage>1?[{playerId:'a',stage:stage-1,score:24000,reason:'cleared'}]:[];
  s=reduce(s,{type:'take_score'},100,()=>deck);
  expect(s.phase).toBe('stage_complete');expect(s.deadline).toBe(5100);expect(s.stages.at(-1)).toMatchObject({score:63000,stageScore:stage>1?39000:63000,timeBonus:0,reason:'take_score'});
  expect(reduce(s,{type:'continue'},5099,()=>deck)).toEqual(s);expect(()=>reduce(s,{type:'give_up'},5099,()=>deck)).toThrow('phase');
  const next=reduce(s,{type:'tick'},5100,()=>deck);
  if(stage===1){expect(next.phase).toBe('playing');expect(next.stage).toBe(2);expect(next.score).toBe(63000);}
  else{expect(next.phase).toBe('ready');expect(next.turnIndex).toBe(1);expect(next.deadline).toBe(35100);expect(next.scores.a).toBe(63000);}
 });
 it('shows an identical count for both viewers, resumes a remount, and never rebanks',()=>{
  let s=fresh();s.stage=2;s.score=63000;s.stages=[{playerId:'a',stage:1,score:24000,reason:'exhausted'}];s=reduce(s,{type:'take_score'},100,()=>deck);
  const a=project(s,'a'),b=project(s,'b');expect(stagePresentation(a,1500)).toEqual(stagePresentation(b,1500));
  expect(stagePresentation(structuredClone(a),1500)?.displayScore).toBe(43500);
  expect(stagePresentation(a,5000)?.displayScore).toBe(63000);expect(s.score).toBe(63000);
  expect(stagePresentation({...a,paused:true,pausedAt:1500},9000)?.displayScore).toBe(43500);
 });
 it.each(['give_up','timeout'] as const)('%s ends the whole run after presenting earned points',reason=>{
  let s=fresh();s.score=81000;s=reduce(s,reason==='timeout'?{type:'tick'}:{type:'give_up'},reason==='timeout'?s.deadline:2,()=>deck);
  expect(s.stages.at(-1)).toMatchObject({reason,finishTurn:true,timeBonus:0,score:81000});
  expect(reduce(s,{type:'tick'},s.deadline,()=>deck).turnIndex).toBe(1);
 });
 it('deadline wins a Take Score race and ready cannot Take Score',()=>{
  const s=fresh();expect(reduce(s,{type:'take_score'},s.deadline,()=>deck).stages.at(-1)?.reason).toBe('timeout');
  expect(()=>reduce({...s,phase:'ready'},{type:'take_score'},2,()=>deck)).toThrow('phase');
 });
 it('awards final-peak and whole-second time bonus once before holding',()=>{
  let s=fresh();s.removed=Array.from({length:27},(_,i)=>i+1);s.waste=12;s.stage=3;s.score=80000;
  s=reduce(s,{type:'remove',index:0},20001,()=>deck);
  expect(s.stages.at(-1)).toMatchObject({reason:'cleared',timeBonus:10000,score:106000,finishTurn:true});
  expect(s.phase).toBe('stage_complete');expect(reduce(s,{type:'tick'},s.deadline,()=>deck).scores.a).toBe(106000);
 });
});
