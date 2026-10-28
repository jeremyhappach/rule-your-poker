// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useDiceResultPresentation} from './useDiceResultPresentation';
import type {HorsesPlayerDiceState} from './useHorsesMobileController';
afterEach(()=>{cleanup();vi.useRealTimers();});
const playing:HorsesPlayerDiceState={dice:[{value:6,isHeld:false}],rollsRemaining:1,isComplete:false,rollKey:10};
const complete:HorsesPlayerDiceState={...playing,isComplete:true,rollKey:11,result:{rank:1,description:'NQ',isQualified:false,cargoSum:0}};
it('retains final actor dice from a terminal snapshot until that exact render lands',()=>{
 vi.useFakeTimers();
 const h=renderHook(({states})=>useDiceResultPresentation('dealer:round',states),{initialProps:{states:{lance:playing}}});
 h.rerender({states:{lance:complete}});
 expect(h.result.current.hold?.dice[0].value).toBe(6);
 expect(h.result.current.announcement).toBeNull();
 expect(h.result.current.resultReady('lance')).toBe(false);
 act(()=>vi.advanceTimersByTime(5000));expect(h.result.current.announcement).toBeNull();
 act(()=>h.result.current.landed(h.result.current.key));
 expect(h.result.current.announcement?.description).toBe('NQ');
 act(()=>vi.advanceTimersByTime(3000));expect(h.result.current.hold).toBeNull();
});
it('skips historical entry and rejects completion from another dealer/round',()=>{
 const h=renderHook(({scope,states})=>useDiceResultPresentation(scope,states),{initialProps:{scope:'d:r1',states:{lance:complete}}});
 expect(h.result.current.hold).toBeNull();
 h.rerender({scope:'d:r2',states:{lance:playing}});h.rerender({scope:'d:r2',states:{lance:complete}});
 const old=h.result.current;
 h.rerender({scope:'new-d:r1',states:{lance:playing}});h.rerender({scope:'new-d:r1',states:{lance:complete}});
 act(()=>old.landed(old.key));expect(h.result.current.announcement).toBeNull();
});
it('never replays consumed or regressive rolls after subsequent snapshots',()=>{
 vi.useFakeTimers();
 const h=renderHook(({state})=>useDiceResultPresentation('d:r',{lance:state}),{initialProps:{state:playing}});
 h.rerender({state:complete});act(()=>h.result.current.landed(h.result.current.key));
 act(()=>vi.advanceTimersByTime(3000));expect(h.result.current.hold).toBeNull();
 h.rerender({state:playing});h.rerender({state:complete});expect(h.result.current.hold).toBeNull();
 h.rerender({state:{...complete,rollKey:9}});expect(h.result.current.hold).toBeNull();
});
