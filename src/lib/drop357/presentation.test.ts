import {describe,it,expect} from 'vitest';
import {dropHandLabel} from './presentation';
import {dropCompletionCue} from './audio';
import type {LaneResult} from './model';
const result=(vector:number[]):LaneResult=>({vector,selected:[],natural:false,points:0,bonus:0,score:0,category:'unused',completedAt:0});
describe('357 smoke presentation',()=>{
 it('names the authoritative screenshot hands',()=>{
  expect(dropHandLabel(result([1,12,13]))).toBe('Pair of Queens');
  expect(dropHandLabel(result([7,11,13]))).toBe('Four Jacks');
  expect(dropHandLabel(result([6,6,15]))).toBe('Sixes full of Aces');
 });
 it('uses one ordinary cue and a longer separate board cadence',()=>{
  const schedule=(filled:boolean)=>{const notes:number[]=[];const ctx={currentTime:0,createOscillator:()=>({frequency:{set value(v:number){notes.push(v)}},connect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};dropCompletionCue(filled).schedule(ctx as never,{} as never,x=>x);return notes;};
  expect(schedule(false)).toHaveLength(2);expect(schedule(true)).toHaveLength(4);expect(schedule(true)).not.toEqual(schedule(false));
  expect(dropCompletionCue(true).durationMs).toBeLessThan(1200);expect(dropCompletionCue(true).durationMs).toBeGreaterThan(dropCompletionCue(false).durationMs);
  expect(dropCompletionCue(true,400,450).durationMs).toBeLessThan(450);
 });
});
