import {describe,it,expect} from 'vitest';
import {totalCountWindow,decisionTimeLeft,scoreBeat,type LabSnapshot,type RoundResult} from './model';

const zero={fifteens:0,pairs:0,runs:0,flush:0,nobs:0,total:0};
const result:RoundResult={id:'run:2',hands:[{...zero,pairs:2,total:2},zero,zero,zero,zero],
  base:2,multiplier:150,award:300,before:50,cumulative:350,scoredAt:10000};
const timed:RoundResult={...result,presentation:{
  beats:[{kind:'pair',hand:0,mask:17,from:0,points:2,at:0,ms:360},{kind:'subtotal',hand:0,mask:0,from:2,points:2,at:360,ms:480},
    ...[1,2,3,4].map((hand,i)=>({kind:'subtotal' as const,hand,mask:0,from:2,points:0,at:840+i*240,ms:240}))],
  baseAt:1800,awardAt:2550,totalAt:4250,endAt:5750}};
describe('Crib Lab stored presentation',()=>{
  it('adds combinations to the base counter while the game total holds its previous value',()=>{
    expect(scoreBeat(timed,10070)).toMatchObject({stage:'combo',mask:17,baseScore:0,gameTotal:50,points:2});
    expect(scoreBeat(timed,10359)).toMatchObject({stage:'combo',baseScore:2,gameTotal:50});
    expect(scoreBeat(timed,10360)).toMatchObject({stage:'subtotal',mask:0,baseScore:2,gameTotal:50});
    expect(scoreBeat(timed,11080)).toMatchObject({stage:'subtotal',index:2,points:0,baseScore:2,gameTotal:50});
  });
  it('holds the completed equation, then credits the game total once from the prior total',()=>{
    expect(scoreBeat(timed,11800)).toMatchObject({stage:'equation',baseScore:2,gameTotal:50});
    expect(scoreBeat(timed,14249)).toMatchObject({stage:'equation',gameTotal:50});
    expect(totalCountWindow(timed)).toEqual({from:50,to:350,startedAt:14250,endsAt:15350});
    expect(scoreBeat(timed,14250)).toMatchObject({stage:'total',baseScore:2,gameTotal:50});
    expect(scoreBeat(timed,14800)).toMatchObject({stage:'total',baseScore:2,gameTotal:200});
    expect(scoreBeat(timed,15350).gameTotal).toBe(350);
    expect(scoreBeat(timed,15750).gameTotal).toBe(350);
  });
  it('also separates base, equation and cumulative total for hand-mode and v1 receipts',()=>{
    expect(scoreBeat(result,10020)).toMatchObject({stage:'hand',index:0,baseScore:0,gameTotal:50});
    expect(scoreBeat(result,11100)).toMatchObject({stage:'hand',baseScore:2,gameTotal:50});
    expect(scoreBeat(result,16000)).toMatchObject({stage:'equation',baseScore:2,gameTotal:50});
    expect(scoreBeat(result,18599).gameTotal).toBe(50);
    expect(scoreBeat(result,19050).gameTotal).toBe(200);
    expect(scoreBeat(result,20000).gameTotal).toBe(350);
  });
  it('keeps a zero-point round at its already-banked total',()=>{
    const blank={...result,hands:[zero,zero,zero,zero,zero],base:0,award:0,cumulative:50};
    for(const at of [10000,16000,18600,19500])expect(scoreBeat(blank,at)).toMatchObject({baseScore:0,gameTotal:50});
  });
  it('displays the banked decision time during a server hold and after scoring',()=>{
    const snapshot={durationMs:240000,deadline:9000,transition:{endsAt:5000}} as LabSnapshot;
    expect(decisionTimeLeft(snapshot,3900)).toBe(4000);
    expect(decisionTimeLeft(snapshot,4999)).toBe(4000);
    expect(decisionTimeLeft({...snapshot,transition:null},5040)).toBe(3960);
    expect(decisionTimeLeft({...snapshot,transition:null,deadline:11000,result:timed},18000)).toBe(1000);
  });
});
