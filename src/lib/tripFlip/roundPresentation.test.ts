import {describe,expect,it} from 'vitest';
import {tripFlipRoundPresentation} from './roundPresentation';
import type {TripFlipBoard} from './model';
const board={phase:'stage_complete',rules:{holdMs:6000},deadline:11000,result:{scoreBefore:7450,displayScore:13650,score:14900,completedAt:5000,stageScore:7450,reason:'take_score'}} as TripFlipBoard;
describe('Trip Flip authoritative round presentation',()=>{
 it('uses previous banked and new cumulative totals without adding either twice',()=>{
  const r=tripFlipRoundPresentation(board,'round2',7500)!;
  expect(r.scoreBefore).toBe(7450);expect(r.score).toBe(14900);expect(r.displayScore).toBe(13650);expect(r.elapsed).toBe(2500);
 });
 it('seeks by the persisted deadline, including a pause shift, without changing it',()=>{
  const shifted={...board,deadline:16000};
  expect(tripFlipRoundPresentation(shifted,'round2',12500)?.elapsed).toBe(2500);
  expect(tripFlipRoundPresentation(board,'round2',12000)?.elapsed).toBe(7000);
  expect(board.deadline).toBe(11000);
 });
 it('does not carry a previous result into live or terminal play',()=>{
  expect(tripFlipRoundPresentation({...board,phase:'playing'},'r',7500)).toBeNull();
  expect(tripFlipRoundPresentation({...board,phase:'complete'},'r',7500)).toBeNull();
 });
});
