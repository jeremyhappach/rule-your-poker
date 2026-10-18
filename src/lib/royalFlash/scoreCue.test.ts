import {describe,it,expect,vi} from 'vitest';
import type {RoyalResult} from './model';
import {royalScoreSteps,royalScoreFrame} from './scoringPresentation';
import {royalScoreCue} from './scoreCue';
const result={presentationVersion:2,presentationMs:21000,scoreBefore:1234,handPoints:50000,timeBonus:2500,score:53734,stageScore:52500,lines:Array.from({length:10},()=>({kind:'pair',points:5000}))} as RoyalResult;
function scheduled(elapsed:number){
 const times:number[]=[],param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()};
 const ctx={currentTime:0,createOscillator:()=>({frequency:param,connect:vi.fn(),start:(at:number)=>times.push(at*1000),stop:vi.fn()}),createGain:()=>({gain:param,connect:vi.fn()})};
 royalScoreCue(result,elapsed,21000-elapsed).schedule(ctx as unknown as AudioContext,{} as AudioNode,n=>n);return times;
}
describe('one Royal presentation timeline',()=>{
 it('starts each highlight, label, count and first audio pulse at the same boundary',()=>{
  const times=scheduled(0),steps=royalScoreSteps(result)!;
  for(const step of steps){
   const before=royalScoreFrame({phase:'stage_complete',deadline:21000,result} as any,step.offset-1)!;
   const at=royalScoreFrame({phase:'stage_complete',deadline:21000,result} as any,step.offset)!;
   expect(before.key).not.toBe(step.key);expect(at).toMatchObject({key:step.key,line:step.line,label:step.label,score:step.from,startedAt:step.offset});
   expect(times).toContain(step.offset);expect(step.duration).toBeGreaterThan(step.countMs);
   expect(royalScoreFrame({phase:'stage_complete',deadline:21000,result} as any,step.offset+step.duration-1)).toMatchObject({key:step.key,score:step.to});
  }
  expect(times.every(t=>steps.some(s=>t>=s.offset&&t<s.offset+s.countMs))).toBe(true);
 });
 it('seeks audio without scheduling expired pulses or the neutral lead-in',()=>{
  expect(scheduled(0)[0]).toBe(1000);
  const elapsed=8450,times=scheduled(elapsed);expect(times.every(t=>t>=0)).toBe(true);
  expect(times.length).toBeLessThan(scheduled(0).length);expect(scheduled(20000)).toEqual([]);
 });
});
