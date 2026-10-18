import {describe,it,expect} from 'vitest';
import {royalScoreFrame,royalScoredCell} from './scoringPresentation';
import type {RoyalBoard} from './model';
const lines=[{kind:'pair',points:5000},...Array.from({length:8},()=>({kind:'incomplete',points:0})),{kind:'flush',points:10000}];
const board={phase:'stage_complete',deadline:20000,result:{scoreBefore:1234,score:19234,stageScore:18000,handPoints:15000,timeBonus:3000,completedAt:5000,presentationMs:15000,lines}} as RoyalBoard;
describe('authoritative Royal Flash scoring presentation',()=>{
 it('presents rows then columns and highlights only their five cells',()=>{
  for(let i=0;i<10;i++){
   const frame=royalScoreFrame(board,6000+i*1000+700)!;
   expect(frame.line).toBe(i);expect(frame.points).toBe(lines[i].points);
   expect(frame.label).toBe(i<5?`Row ${i+1}`:`Column ${i-4}`);
   expect(Array.from({length:25},(_,n)=>royalScoredCell(frame.line,n)).filter(Boolean)).toHaveLength(5);
   expect(frame.score).toBe(1234+lines.slice(0,i+1).reduce((s,l)=>s+l.points,0));
  }
 });
 it('counts each line exactly once, then bonus, then exact total',()=>{
  expect(royalScoreFrame(board,5000)?.score).toBe(1234);
  expect(royalScoreFrame(board,5900)?.score).toBe(1234);
  expect(royalScoreFrame(board,6999)?.line).toBe(0);
  expect(royalScoreFrame(board,7000)?.line).toBe(1);
  expect(royalScoreFrame(board,6300)?.score).toBe(3734);
  expect(royalScoreFrame(board,6600)?.score).toBe(6234);
  expect(royalScoreFrame(board,16000)).toMatchObject({key:'bonus',score:16234,points:3000});
  expect(royalScoreFrame(board,16500)?.score).toBe(17734);
  expect(royalScoreFrame(board,18000)).toMatchObject({key:'total',score:19234});
 });
 it('seeks on reconnect and follows paused/shifted server deadline without replaying totals',()=>{
  expect(royalScoreFrame(board,13000)).toMatchObject({line:7,score:6234});
  expect(royalScoreFrame({...board,deadline:30000},23000)).toEqual({...royalScoreFrame(board,13000),startedAt:23000,endsAt:23600});
 });
 it('shows incomplete lines honestly and never reconstructs legacy or inconsistent results',()=>{
  expect(royalScoreFrame(board,7100)).toMatchObject({hand:'Incomplete line',points:0});
  expect(royalScoreFrame({...board,result:{...board.result!,presentationMs:undefined}},5000)?.key).toBe('total');
  expect(royalScoreFrame({...board,result:{...board.result!,handPoints:999}},5000)?.key).toBe('total');
  expect(royalScoreFrame({...board,phase:'playing'},5000)).toBeNull();
 });
});
