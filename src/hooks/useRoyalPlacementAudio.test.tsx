// @vitest-environment jsdom
import {renderHook} from '@testing-library/react';import {beforeEach,describe,it,expect,vi} from 'vitest';
import {useRoyalPlacementAudio} from './useRoyalPlacementAudio';import type {RoyalSnapshot} from '@/lib/royalFlash/model';
const request=vi.hoisted(()=>vi.fn(()=>vi.fn()));vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request}}));
const frame=(placements:number,scope='run:1')=>({scope,revision:placements,board:{placements}} as RoyalSnapshot);
describe('Royal Flash placement audio admission',()=>{
 beforeEach(()=>request.mockClear());
 it('sounds once for a confirmed placement, never initial state or duplicate snapshots',()=>{
  const {rerender}=renderHook(({v})=>useRoyalPlacementAudio(v,'user',0,true),{initialProps:{v:frame(0)}});expect(request).not.toHaveBeenCalled();
  rerender({v:frame(1)});rerender({v:frame(1)});expect(request).toHaveBeenCalledTimes(1);
 });
 it('cancels on unmount and does not replay across recovery, mode/round changes or mute presentation',()=>{
  const stop=vi.fn();request.mockReturnValue(stop);
  const {rerender,unmount}=renderHook(({v,epoch,active})=>useRoyalPlacementAudio(v,'user',epoch,active),{initialProps:{v:frame(0),epoch:0,active:true}});
  rerender({v:frame(1),epoch:0,active:true});rerender({v:frame(2),epoch:1,active:true});expect(stop).toHaveBeenCalled();
  rerender({v:frame(0,'other:1'),epoch:1,active:true});rerender({v:frame(1,'other:1'),epoch:1,active:false});rerender({v:frame(2,'other:1'),epoch:1,active:true});expect(request).toHaveBeenCalledTimes(1);unmount();
 });
});
