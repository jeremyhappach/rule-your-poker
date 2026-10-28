// @vitest-environment jsdom
import {renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {useGolfScoringPresentation} from './useGolfScoringPresentation';
import type {GolfSnapshot} from '@/lib/golf/model';
const playing={id:'d',scope:'r',phase:'playing',rules:{presentation:{scoringDelayMs:1200}}} as GolfSnapshot;
const result={...playing,phase:'complete',settled:true,presentation:{startedAt:1000,resultsAt:10000,endsAt:15000},terminal:{startedAt:15000,deadline:18000}} as GolfSnapshot;
it('a successor cannot interrupt unfinished score writing even after the server window ends',()=>{
 const h=renderHook(({v,now,written})=>useGolfScoringPresentation(v,0,now,false,written),{initialProps:{v:playing,now:900,written:null as string|null}});
 h.rerender({v:{...result,phase:'hole_complete',settled:false},now:1000,written:null});
 h.rerender({v:{...playing,scope:'next'},now:30000,written:null});expect(h.result.current.snapshot?.scope).toBe('r');
 h.rerender({v:{...playing,scope:'next'},now:30000,written:'old'});expect(h.result.current.snapshot?.scope).toBe('r');
 h.rerender({v:{...playing,scope:'next'},now:30000,written:'r'});expect(h.result.current.snapshot?.scope).toBe('next');
});
it('waits for last motion, full configured pause, counting and hold; equal and late snapshots cannot reset it',()=>{
 const h=renderHook(({v,now,busy,epoch})=>useGolfScoringPresentation(v,epoch,now,busy),{initialProps:{v:playing,now:900,busy:false,epoch:0}});
 h.rerender({v:result,now:1000,busy:true,epoch:0});expect(h.result.current.waiting).toBe(true);
 h.rerender({v:result,now:2000,busy:false,epoch:0});expect(h.result.current.waiting).toBe(true);
 h.rerender({v:{...result},now:3200,busy:false,epoch:0});expect(h.result.current.now).toBe(1000);expect(h.result.current.waiting).toBe(false);
 h.rerender({v:{...result,finished:true},now:15000,busy:false,epoch:0});expect(h.result.current.winnerReady).toBe(false);
 h.rerender({v:result,now:17200,busy:false,epoch:0});expect(h.result.current.winnerReady).toBe(true);expect(h.result.current.terminalDone).toBe(false);
 h.rerender({v:result,now:20200,busy:false,epoch:0});expect(h.result.current.terminalDone).toBe(true);
});
it('reconnect seeks persisted time without adding/replaying a live hold',()=>{
 const h=renderHook(({epoch})=>useGolfScoringPresentation(result,epoch,16000,false),{initialProps:{epoch:1}});
 expect(h.result.current.seek).toBe(true);expect(h.result.current.now).toBe(16000);expect(h.result.current.winnerReady).toBe(true);
 h.rerender({epoch:2});expect(h.result.current.now).toBe(16000);
});
it('retains a completed hole while a successor arrives, and never presents it as actionable',()=>{
 const h=renderHook(({v,now})=>useGolfScoringPresentation(v,0,now,false),{initialProps:{v:playing,now:900}});
 h.rerender({v:{...result,phase:'hole_complete',settled:false},now:1000});
 const successor={...playing,scope:'next'};h.rerender({v:successor,now:15000});expect(h.result.current.snapshot?.scope).toBe('r');
 h.rerender({v:successor,now:16200});expect(h.result.current.snapshot?.scope).toBe('next');
});
it('paused wall time cannot admit a winner and resumed authoritative schedule preserves the visual offset',()=>{
 const h=renderHook(({v,now})=>useGolfScoringPresentation(v,0,now,false),{initialProps:{v:playing,now:900}});
 h.rerender({v:result,now:1000});
 h.rerender({v:{...result,paused:true,pausedAt:2000},now:60000});expect(h.result.current.now).toBe(800);expect(h.result.current.winnerReady).toBe(false);
 const resumed={...result,presentation:{...result.presentation!,startedAt:59000,resultsAt:68000,endsAt:73000},terminal:{...result.terminal!,startedAt:73000,deadline:76000}};
 h.rerender({v:resumed,now:60000});expect(h.result.current.now).toBe(58800);expect(h.result.current.winnerReady).toBe(false);
});
