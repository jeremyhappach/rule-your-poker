// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,renderHook} from '@testing-library/react';
import {useWordScorePresentation} from './useWordScorePresentation';
import {visibleBoard} from './presentation';
import type {WordsSnapshot} from './model';
const board=Array(225).fill(null);[112,113,114].forEach((s,i)=>board[s]={id:i,face:'A',value:1});
const v={identity:{dealerGameId:'score-test'},viewerId:'me',board,turn:2,canAct:true,finished:false,paused:false,deadline:999999,scores:{other:8},moves:[{turn:1,playerId:'other',action:'place',points:8,words:[]}],movePresentation:{version:1,turn:1,playerId:'other',squares:[114,112,113],startedAt:1000,focusMs:200,flipMs:260,announceAt:1980,noticeMs:1600,readyAt:4000}} as unknown as WordsSnapshot;
afterEach(()=>{cleanup();sessionStorage.clear();});
it('replays the latest unseen async word in reading order, resumes elapsed time after refresh, then retires it',()=>{
 const done=vi.fn(),one=renderHook(({now})=>useWordScorePresentation(v,now,true,done),{initialProps:{now:20000}});
 expect(visibleBoard(one.result.current.visual,20000).filter(Boolean)).toHaveLength(0);
 one.rerender({now:20200});expect(visibleBoard(one.result.current.visual,20200)[112]).not.toBeNull();expect(visibleBoard(one.result.current.visual,20200)[113]).toBeNull();
 one.rerender({now:20500});expect(visibleBoard(one.result.current.visual,20500)[113]).not.toBeNull();expect(visibleBoard(one.result.current.visual,20500)[114]).toBeNull();one.unmount();
 const again=renderHook(({now})=>useWordScorePresentation(v,now,true,done),{initialProps:{now:21500}});expect(again.result.current.frame?.score).toBe(0);
 again.rerender({now:22580});expect(again.result.current.frame?.score).toBe(8);expect(done).not.toHaveBeenCalled();
 again.rerender({now:24580});expect(again.result.current.frame).toBeNull();expect(done).toHaveBeenCalledTimes(1);again.rerender({now:30000});expect(done).toHaveBeenCalledTimes(1);expect(v.scores.other).toBe(8);expect(again.result.current.visual.deadline).toBe(999999);
});
it('never holds a live turn past its authored handoff and isolates another match',()=>{
 const one=renderHook(()=>useWordScorePresentation(v,4000,false));expect(one.result.current.frame).toBeNull();one.unmount();
 const other=renderHook(()=>useWordScorePresentation({...v,identity:{...v.identity,dealerGameId:'different'}},20000,true));expect(other.result.current.frame?.phase).toBe('reveal');
});
it('does not consume an unseen opponent event while an async match is held',()=>{
 const hook=renderHook(({held,now})=>useWordScorePresentation({...v,paused:held,canAct:!held},now,true),{initialProps:{held:true,now:20000}});expect(hook.result.current.frame).toBeNull();expect(sessionStorage.length).toBe(0);
 hook.rerender({held:false,now:25000});expect(hook.result.current.frame?.phase).toBe('reveal');expect(hook.result.current.visual.movePresentation?.startedAt).toBe(25000);
});
