// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useQuintzeeRumble} from './useQuintzeeRumble';
import {_setFromLocalCommit} from '@/lib/geometryLab/defaultsRegistry';
import {QUINTZEE_ROLL_TIMING_KEY} from '@/lib/geometryLab/quintzeeRollTiming';
afterEach(()=>{vi.useRealTimers();_setFromLocalCommit(QUINTZEE_ROLL_TIMING_KEY,{durationMs:1500});});
describe('Quintzee roll presentation',()=>{
 it('does not replay dice on reconnect, but animates a new roll for 1500 ms with frozen holds',()=>{
  vi.useFakeTimers();
  const {result,rerender}=renderHook(({serial,held})=>useQuintzeeRumble('card',serial,5,held,true),{initialProps:{serial:1,held:[0,2]}});
  expect(result.current).toBeNull();
  rerender({serial:2,held:[0,2]});
  expect(result.current?.held).toEqual([0,2]);
  act(()=>vi.advanceTimersByTime(1499));
  expect(result.current).not.toBeNull();
  rerender({serial:2,held:[]});
  expect(result.current?.held).toEqual([0,2]);
  act(()=>vi.advanceTimersByTime(1));
  expect(result.current).toBeNull();
 });
 it('cancels on expiration and cannot carry rumble into another round',()=>{
  vi.useFakeTimers();
  const {result,rerender}=renderHook(({scope,serial,playing})=>useQuintzeeRumble(scope,serial,5,[],playing),{initialProps:{scope:'one',serial:1,playing:true}});
  rerender({scope:'one',serial:2,playing:true});expect(result.current).not.toBeNull();
  rerender({scope:'one',serial:2,playing:false});expect(result.current).toBeNull();
  rerender({scope:'two',serial:0,playing:false});expect(result.current).toBeNull();
  act(()=>vi.advanceTimersByTime(1500));expect(result.current).toBeNull();
 });
});

it('applies tuned duration to the next roll without extending or shortening an active roll',()=>{
 vi.useFakeTimers();
 const {result,rerender}=renderHook(({serial})=>useQuintzeeRumble('card',serial,5,[0],true),{initialProps:{serial:1}});
 rerender({serial:2});
 act(()=>{vi.advanceTimersByTime(300);_setFromLocalCommit(QUINTZEE_ROLL_TIMING_KEY,{durationMs:700});});
 act(()=>vi.advanceTimersByTime(1199));expect(result.current).not.toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(result.current).toBeNull();
 rerender({serial:3});act(()=>vi.advanceTimersByTime(699));expect(result.current?.held).toEqual([0]);
 act(()=>vi.advanceTimersByTime(1));expect(result.current).toBeNull();
});
