// @vitest-environment jsdom
import {act,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useQuintzeeRumble} from './useQuintzeeRumble';
afterEach(()=>vi.useRealTimers());
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
