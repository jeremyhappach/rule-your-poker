import {describe,it,expect} from 'vitest';
import {QUINTZEE_CATEGORIES,quintzeeBasePreview,quintzeeClock,acceptQuintzeeSnapshot,type QuintzeeBoard,type QuintzeeSnapshot} from './model';
describe('Quintzee scoring projection',()=>{
 it('reuses matching scoring without small straight or joker substitution',()=>{
  expect(QUINTZEE_CATEGORIES).toHaveLength(12);
  expect(quintzeeBasePreview('full_house',[6,6,6,6,6])).toBe(0);
  expect(quintzeeBasePreview('large_straight',[6,6,6,6,6])).toBe(0);
  expect(quintzeeBasePreview('yahtzee',[6,6,6,6,6])).toBe(50);
  expect(quintzeeBasePreview('three_of_a_kind',[6,6,6,6,6])).toBe(30);
 });
 it('rejects unresolved, missing and invalid dice',()=>{
  for(const d of [[],[1,2,3,4],[1,2,3,4,0],[1,2,3,4,6.1]])expect(()=>quintzeeBasePreview('chance',d)).toThrow();
 });
 it('scales display interpolation to the frozen configured duration',()=>{
  for(const durationMs of [90000,180000,240000]){
   const b={rules:{durationMs},deadline:durationMs,result:null} as QuintzeeBoard;
   expect(quintzeeClock(b,0).multiplier).toBe(300);
   expect(quintzeeClock(b,durationMs/2).multiplier).toBe(200);
   expect(quintzeeClock(b,durationMs+1).multiplier).toBe(100);
  }
 });
 it('rejects regressions and conflicting equal-revision snapshots',()=>{
  const a={id:'a',revision:2,scope:'a:1:0',theme:'classic',pausedAt:null,state:{round:1}} as QuintzeeSnapshot;
  expect(acceptQuintzeeSnapshot(a,{...a,revision:1})).toBe(false);
  expect(acceptQuintzeeSnapshot(a,{...a,theme:'modern'})).toBe(false);
  expect(acceptQuintzeeSnapshot(a,{...a,status:'abandoned'})).toBe(false);
  expect(acceptQuintzeeSnapshot(a,{...a,playerNames:{player:'Alex'}})).toBe(false);
  expect(acceptQuintzeeSnapshot(a,{...a,serverAt:55})).toBe(true);
  expect(acceptQuintzeeSnapshot(a,{...a,id:'b',revision:3})).toBe(false);
 });
});
