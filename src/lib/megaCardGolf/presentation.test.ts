import {describe,it,expect} from 'vitest';
import {createRun,applyIntent,recoverRun,projectRun} from './engine';
import {INITIAL_COURSES} from './config';
import {emptyPresentation,receivePresentation,presentationFrame,scoreSteps,formatGolfScore} from './presentation';
import {golfVisibleSubtotal} from '../golf/scoring';
const make=()=>applyIntent(createRun('r','u',INITIAL_COURSES[0],Array.from({length:9},()=>Array.from({length:52},(_,i)=>i)),0),{type:'open',indices:[0,5]},1);
describe('presentation never owns gameplay',()=>{
 it('exposes the old hidden card only on the exact accepted replacement, then dissolves and arrives',()=>{
  const run=applyIntent(make(),{type:'draw'},2),before=projectRun(run,2),after=projectRun(applyIntent(run,{type:'replace',index:1},3),3);
  let state=receivePresentation(emptyPresentation(),before,0);
  expect(presentationFrame(state,0)!.view.cards[1]).toBeNull();
  state=receivePresentation(state,after,100,false,{type:'replace',index:1});
  expect(presentationFrame(state,100)!.view.cards[1]).toBe(1);
  expect(presentationFrame(state,1599)!.replacement?.stage).toBe('reveal');
  expect(presentationFrame(state,1600)!.replacement?.stage).toBe('dissolve');
  expect(presentationFrame(state,1950)!.view.cards[1]).toBe(before.pending);
  expect(presentationFrame(state,2300)!.locked).toBe(false);
  const replay=receivePresentation(state,after,200,false,{type:'replace',index:1});
  expect(replay.events).toHaveLength(1);
  expect(receivePresentation(state,before,201)).toBe(state);
 });
 it('does not infer a hidden reveal from a revision gap or reconnect',()=>{
  const run=applyIntent(make(),{type:'draw'},2),before=projectRun(run,2);
  const next=applyIntent(applyIntent(run,{type:'replace',index:1},3),{type:'draw'},4);
  const initial=receivePresentation(emptyPresentation(),before,0);
  expect(receivePresentation(initial,projectRun(next,4),100,false,{type:'replace',index:1}).events).toHaveLength(0);
  expect(receivePresentation(initial,projectRun(next,4),100,true).events).toHaveLength(0);
 });
 it('moves a played face-up card directly and masks an early next-stock snapshot until arrival ends',()=>{
  const run=applyIntent(make(),{type:'draw'},2),before=projectRun(run,2);
  const replaced=applyIntent(run,{type:'replace',index:0},3),drawn=applyIntent(replaced,{type:'draw'},4);
  let state=receivePresentation(emptyPresentation(),before,0);
  state=receivePresentation(state,projectRun(replaced,3),100,false,{type:'replace',index:0});
  state=receivePresentation(state,projectRun(drawn,4),150);
  for(const at of [100,200,449]){
   const frame=presentationFrame(state,at)!;
   expect(frame.replacement?.stage).toBe('arrive');expect(frame.view.cards[0]).toBe(before.pending);
   expect(frame.view.pending).toBeNull();expect(frame.locked).toBe(true);
  }
  expect(presentationFrame(state,450)!.view.pending).toBe(drawn.pending);
 });
 it('holds committed results through newer deals, conceals future totals, and deduplicates score cues',()=>{
  const run=make(),done=recoverRun(run,run.deadline),next=recoverRun(done,done.deadline);
  let state=receivePresentation(emptyPresentation(),projectRun(run,1),0);
  state=receivePresentation(state,projectRun(done,done.deadline-1),0);
  const end=state.events[0].end;
  state=receivePresentation(state,projectRun(next,next.deadline-1),100);
  expect(presentationFrame(state,100)!.view.hole).toBe(1);
  expect(presentationFrame(state,100)!.view.results).toHaveLength(1);
  expect(presentationFrame(state,end)!.view.hole).toBe(2);
  expect(receivePresentation(state,projectRun(next,next.deadline-1),200).events).toHaveLength(1);
  const cue=presentationFrame(state,done.results[0].hidden.length*500)!.cue;
  expect(cue?.id).toBe('r/hole/1/step/0');expect(cue?.fresh).toBe(true);
  expect(presentationFrame(state,done.results[0].hidden.length*500+300)!.cue?.fresh).toBe(false);
 });
 it('pairs count together and all card-value combinations preserve canonical scoring',()=>{
  expect(scoreSteps([4,6,9,1,19,22]).map(s=>s.total)).toEqual([5,3,3,3]);
  expect(scoreSteps([4,6,9,1,19,22]).map(s=>s.indices)).toEqual([[0],[3],[1,4],[2,5]]);
  for(let a=0;a<13;a++)for(let b=0;b<13;b++)for(let c=0;c<13;c++){
   const cards=[a,b,c,(a+3)%13,(b+6)%13,(c+9)%13];
   expect(scoreSteps(cards).at(-1)!.total).toBe(golfVisibleSubtotal(cards));
  }
  expect(scoreSteps([1,14,12,0,39,25]).at(-1)!.total).toBe(-2);
  expect(scoreSteps([4,6,9,17,19,22]).every(s=>s.indices.length===2&&s.points===0)).toBe(true);
 });
 it('keeps final-hole authority completed while the client counts, and reconnect skips old sounds',()=>{
  const config={...INITIAL_COURSES[0],holes:1};
  const run=createRun('final','u',config,[Array.from({length:52},(_,i)=>i)],0),done=recoverRun(run,run.deadline);
  let state=receivePresentation(emptyPresentation(),projectRun(run,1),0);
  state=receivePresentation(state,projectRun(done,done.deadline),0);
  expect(state.latest!.status).toBe('completed');expect(presentationFrame(state,0)!.locked).toBe(true);
  expect(presentationFrame(state,state.events[0].end)!.locked).toBe(false);
  state=receivePresentation(state,projectRun(done,done.deadline),100,true);
  expect(presentationFrame(state,100)!.cue).toBeNull();expect(presentationFrame(state,100)!.scoring!.tally).toBe(done.score);
 });
 it('renders signed values without changing numbers or conflating missing with even',()=>{
  expect([null,undefined,-2,0,3].map(formatGolfScore)).toEqual(['—','—','-2','E','+3']);
 });
});
