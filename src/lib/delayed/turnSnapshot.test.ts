import {describe,it,expect} from 'vitest';
import {admitTurnSnapshot} from './turnSnapshot';
const snapshot=()=>({revision:18,reviewRevision:2,serverAt:100,totals:{me:57,other:71},pendingResults:{other:0},holeResults:[{actor:'me',hole:1,score:35}],board:{serverAt:100,deadline:10000,cards:[0,1,null],revision:1},ownResults:[{board:{serverAt:100,cards:[0,1,2],results:[{score:35,at:50}]}}]});
describe('async equal-revision authority',()=>{
 it('admits fresh root, active-board and saved-board transport clocks without changing gameplay',()=>{
  const old=snapshot(),next=structuredClone(old);next.serverAt=200;next.board.serverAt=200;next.ownResults[0].board.serverAt=200;
  expect(admitTurnSnapshot(old,next)).toBe(true);
 });
 it('rejects changed cards, immutable result timestamps and gameplay deadlines at the same revision',()=>{
  for(const mutate of [(v:ReturnType<typeof snapshot>)=>{v.board.cards[0]=5;},(v:ReturnType<typeof snapshot>)=>{v.board.deadline++;},(v:ReturnType<typeof snapshot>)=>{v.ownResults[0].board.results[0].at++;}]){
   const old=snapshot(),next=structuredClone(old);mutate(next);expect(()=>admitTurnSnapshot(old,next)).toThrow('Conflicting turn snapshot');
  }
 });
 it('admits hole-score disclosure only with a newer review revision and still rejects stale review/gameplay',()=>{
  const old=snapshot(),next=structuredClone(old);next.holeResults.push({actor:'other',hole:1,score:25});next.totals.other=25;
  expect(()=>admitTurnSnapshot(old,next)).toThrow();next.reviewRevision++;expect(admitTurnSnapshot(old,next)).toBe(true);
  expect(admitTurnSnapshot(next,old)).toBe(false);expect(admitTurnSnapshot(old,{...old,revision:17})).toBe(false);
 });
});
