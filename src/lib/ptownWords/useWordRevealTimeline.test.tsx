// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';import {cleanup,renderHook} from '@testing-library/react';
import {useWordRevealTimeline,projectWordReveal} from './useWordRevealTimeline';import {visibleBoardTile} from './presentation';import type {WordsSnapshot} from './model';
const board=Array(225).fill(null);[112,113,114].forEach((s,i)=>board[s]={id:i,face:'A',letter:'A',value:1});
const v={identity:{dealerGameId:'d'},viewerId:'viewer',board,turn:2,finished:false,paused:false,deadline:184000,moves:[{turn:1,playerId:'other',action:'place',points:8,words:[]}],movePresentation:{version:1,turn:1,playerId:'other',squares:[112,113,114],startedAt:1000,focusMs:200,flipMs:260,announceAt:1980,noticeMs:1600,readyAt:4000}} as WordsSnapshot;
afterEach(()=>{cleanup();sessionStorage.clear();});
it('admits one tile on late first observation and preserves the server deadline and final hold',()=>{
 const next=projectWordReveal(v,1700);expect([112,113,114].map(s=>!!visibleBoardTile(next,s,1700))).toEqual([true,false,false]);expect([112,113,114].map(s=>!!visibleBoardTile(next,s,1960))).toEqual([true,true,false]);expect(next.deadline).toBe(v.deadline);expect(next.movePresentation!.readyAt).toBe(4000);expect(next.movePresentation!.announceAt).toBe(2480);expect(next.movePresentation!.announceAt+next.movePresentation!.noticeMs+350).toBe(4000);expect(v.movePresentation!.startedAt).toBe(1000);
});
it('keeps the first receipt across repeated events, refresh and a canonical pause shift',()=>{
 const one=renderHook(({value,now})=>useWordRevealTimeline(value,now),{initialProps:{value:v,now:1700}});const first=one.result.current!.movePresentation;one.rerender({value:{...v,revision:7},now:1900});expect(one.result.current!.movePresentation).toEqual(first);one.unmount();
 const again=renderHook(({value,now})=>useWordRevealTimeline(value,now),{initialProps:{value:v,now:2400}});expect(again.result.current!.movePresentation).toEqual(first);
 const shifted={...v,movePresentation:{...v.movePresentation!,startedAt:1500,announceAt:2480,readyAt:4500},deadline:184500};again.rerender({value:shifted,now:2800});expect(again.result.current!.movePresentation!.startedAt).toBe(first!.startedAt+500);expect(again.result.current!.deadline).toBe(184500);
});
it('does not invent another window for a very late reconnect or replay own placements',()=>{expect(projectWordReveal(v,3900)).toBe(v);expect(projectWordReveal({...v,viewerId:'other'},1700).movePresentation).toBe(v.movePresentation);});
