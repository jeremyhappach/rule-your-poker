import {describe,it,expect} from 'vitest';
import {royalScoreFrame,royalScoredCell} from './scoringPresentation';
import type {RoyalBoard} from './model';
const lines=[{kind:'pair',points:5000},...Array.from({length:8},()=>({kind:'incomplete',points:0})),{kind:'flush',points:10000}];
const board={phase:'stage_complete',deadline:26000,result:{scoreBefore:1234,score:19234,stageScore:18000,handPoints:15000,timeBonus:3000,completedAt:5000,presentationMs:21000,presentationVersion:2,lines}} as RoyalBoard;
describe('authoritative Royal Flash scoring presentation',()=>{
 it('presents rows then columns and highlights only their five cells',()=>{
  for(let i=0;i<10;i++){
   const frame=royalScoreFrame(board,6000+i*1600+1200)!;
   expect(frame.line).toBe(i);expect(frame.points).toBe(lines[i].points);
   expect(frame.label).toBe(i<5?`Row ${i+1}`:`Column ${i-4}`);
   expect(Array.from({length:25},(_,n)=>royalScoredCell(frame.line,n)).filter(Boolean)).toHaveLength(5);
   expect(frame.score).toBe(1234+lines.slice(0,i+1).reduce((s,l)=>s+l.points,0));
  }
 });
 it('counts each line exactly once, then bonus, then exact total',()=>{
  expect(royalScoreFrame(board,5000)?.score).toBe(1234);
  expect(royalScoreFrame(board,5999)?.score).toBe(1234);
  expect(royalScoreFrame(board,7599)?.line).toBe(0);
  expect(royalScoreFrame(board,7600)?.line).toBe(1);
  expect(royalScoreFrame(board,6550)?.score).toBe(3734);
  expect(royalScoreFrame(board,7100)?.score).toBe(6234);
  expect(royalScoreFrame(board,22000)).toMatchObject({key:'bonus',score:16234,points:3000});
  expect(royalScoreFrame(board,22550)?.score).toBe(17734);
  expect(royalScoreFrame(board,24000)).toMatchObject({key:'total',score:19234});
 });
 it('seeks on reconnect and follows paused/shifted server deadline without replaying totals',()=>{
  expect(royalScoreFrame(board,17200)).toMatchObject({line:7,score:6234});
  expect(royalScoreFrame({...board,deadline:36000},27200)).toEqual({...royalScoreFrame(board,17200),startedAt:27200,endsAt:28300});
 });
 it('shows incomplete lines honestly and never reconstructs legacy or inconsistent results',()=>{
  expect(royalScoreFrame(board,7700)).toMatchObject({hand:'Incomplete line',points:0});
  expect(royalScoreFrame({...board,result:{...board.result!,presentationMs:undefined}},5000)?.key).toBe('total');
  expect(royalScoreFrame({...board,result:{...board.result!,handPoints:999}},5000)?.key).toBe('total');
  expect(royalScoreFrame({...board,phase:'playing'},5000)).toBeNull();
 });
});
