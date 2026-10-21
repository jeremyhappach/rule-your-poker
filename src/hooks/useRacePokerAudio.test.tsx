// @vitest-environment jsdom
import {cleanup,renderHook} from '@testing-library/react';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useRacePokerAudio} from './useRacePokerAudio';import type {RacePokerSnapshot} from '@/lib/racePoker/model';
const request=vi.hoisted(()=>vi.fn((_request:{id:string})=>vi.fn()));vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request}}));
const frame=(revision:number,phase='playing')=>({scope:'a:1:p',revision,paused:false,viewerId:'p',terminal:{winnerIds:['p']},board:{phase,hand:revision>1?[0]:[],result:phase==='stage_complete'?{points:4500}:null}} as RacePokerSnapshot);
beforeEach(()=>request.mockClear());afterEach(cleanup);
it('admits new card, hoof and victory edges once, with cancellation',()=>{
 const stop=vi.fn();request.mockReturnValue(stop);const {rerender,unmount}=renderHook(({v})=>useRacePokerAudio(v,'user',0,20,true,'','cards',false),{initialProps:{v:frame(1)}});
 expect(request).not.toHaveBeenCalled();rerender({v:frame(2)});rerender({v:frame(2)});expect(request).toHaveBeenCalledTimes(1);
 rerender({v:frame(3,'stage_complete')});rerender({v:frame(4,'complete')});expect(request).toHaveBeenCalledTimes(3);expect(request.mock.calls.map(c=>c[0].id)).toEqual(expect.arrayContaining([expect.stringContaining(':card:'),expect.stringContaining(':hoof:'),expect.stringContaining(':victory:')]));unmount();expect(stop).toHaveBeenCalled();
});
it('never sounds recovered cards, results or victory snapshots',()=>{
 const {rerender}=renderHook(({v,epoch})=>useRacePokerAudio(v,'user',epoch,5,true,'','cards',false),{initialProps:{v:frame(1),epoch:0}});
 rerender({v:frame(2),epoch:1});rerender({v:frame(3,'stage_complete'),epoch:2});rerender({v:frame(4,'complete'),epoch:3});expect(request).not.toHaveBeenCalled();
});
it('warns at five and two seconds and suppresses paused or hidden-panel cues',()=>{
 const {rerender}=renderHook(({seconds,tab,paused})=>useRacePokerAudio({...frame(1),paused},'user',0,seconds,true,'',tab,false),{initialProps:{seconds:6,tab:'cards',paused:false}});
 rerender({seconds:5,tab:'cards',paused:false});rerender({seconds:4,tab:'cards',paused:false});rerender({seconds:2,tab:'cards',paused:false});expect(request).toHaveBeenCalledTimes(2);
 rerender({seconds:6,tab:'history',paused:false});rerender({seconds:5,tab:'history',paused:false});rerender({seconds:2,tab:'cards',paused:true});expect(request).toHaveBeenCalledTimes(2);
});
it('reduced motion suppresses decorative cues but keeps clock warnings',()=>{
 const {rerender}=renderHook(({v,seconds})=>useRacePokerAudio(v,'user',0,seconds,true,'','cards',false,true),{initialProps:{v:frame(1),seconds:6}});
 rerender({v:frame(2),seconds:6});expect(request).not.toHaveBeenCalled();rerender({v:frame(2),seconds:5});expect(request).toHaveBeenCalledTimes(1);
});

it('does not play a victory fanfare for an exact draw',()=>{
 const {rerender}=renderHook(({v})=>useRacePokerAudio(v,'user',0,0,true,'','cards',false),{initialProps:{v:frame(3,'stage_complete')}});
 rerender({v:{...frame(4,'complete'),terminal:{...frame(4,'complete').terminal!,winnerIds:['p','other']}}});expect(request).not.toHaveBeenCalled();
});
it('does not treat an autoplay control revision as a selected card',()=>{
 const {rerender}=renderHook(({v})=>useRacePokerAudio(v,'user',0,20,true,'','cards',false),{initialProps:{v:frame(2)}});
 rerender({v:frame(3)});expect(request).not.toHaveBeenCalled();
 rerender({v:{...frame(4),board:{...frame(4).board,hand:[0,1]}}});expect(request).toHaveBeenCalledTimes(1);
});
