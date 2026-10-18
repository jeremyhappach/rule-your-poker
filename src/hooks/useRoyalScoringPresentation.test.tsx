// @vitest-environment jsdom
import {renderHook} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {useRoyalScoringPresentation} from './useRoyalScoringPresentation';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
const follow=vi.hoisted(()=>vi.fn(()=>vi.fn()));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow}}));
const view=(phase='playing')=>({scope:'run:1',board:{phase,deadline:15000,result:phase==='stage_complete'?{id:'result',presentationMs:15000,completedAt:0,scoreBefore:0,score:50000,stageScore:50000,handPoints:50000,timeBonus:0,lines:Array.from({length:10},()=>({kind:'pair',points:5000}))}:null}} as RoyalSnapshot);
describe('Royal scoring audio admission',()=>{
 beforeEach(()=>follow.mockClear());
 it('sounds once per live counted line and cancels on unmount',()=>{
  const stop=vi.fn();follow.mockReturnValue(stop);
  const {rerender,unmount}=renderHook(({v,now})=>useRoyalScoringPresentation(v,'user',0,true,now),{initialProps:{v:view(),now:0}});
  rerender({v:view('stage_complete'),now:0});rerender({v:view('stage_complete'),now:100});expect(follow).not.toHaveBeenCalled();
  rerender({v:view('stage_complete'),now:1000});rerender({v:view('stage_complete'),now:1100});expect(follow).toHaveBeenCalledTimes(1);
  rerender({v:view('stage_complete'),now:2000});expect(follow).toHaveBeenCalledTimes(2);expect(stop).toHaveBeenCalled();unmount();
 });
 it('seeks silently on initial result, recovery, background and reentry',()=>{
  const {rerender}=renderHook(({v,epoch,active,now})=>useRoyalScoringPresentation(v,'user',epoch,active,now),{initialProps:{v:view('stage_complete'),epoch:0,active:true,now:5500}});
  expect(follow).not.toHaveBeenCalled();
  rerender({v:view(),epoch:0,active:true,now:0});rerender({v:view('stage_complete'),epoch:1,active:true,now:2200});expect(follow).not.toHaveBeenCalled();
  rerender({v:view(),epoch:1,active:true,now:0});rerender({v:view('stage_complete'),epoch:1,active:true,now:1000});expect(follow).toHaveBeenCalledTimes(1);
  rerender({v:view('stage_complete'),epoch:2,active:true,now:3000});expect(follow).toHaveBeenCalledTimes(1);
  rerender({v:view('stage_complete'),epoch:2,active:false,now:3100});rerender({v:view('stage_complete'),epoch:2,active:true,now:4000});expect(follow).toHaveBeenCalledTimes(1);
 });
});
