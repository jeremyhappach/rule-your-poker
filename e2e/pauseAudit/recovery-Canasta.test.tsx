import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
const ui=vi.hoisted(()=>({editor:null as any,timer:null as any}));
vi.mock('@/components/canasta/HandEditor',()=>({HandEditor:(p:any)=>{ui.editor=p;return null;}}));
vi.mock('@/lib/canonicalShell/ShellTimerRail',()=>({ShellTimerRail:()=>null,useShellTimer:(p:any)=>{ui.timer=p;}}));
vi.mock('@/lib/canonicalShell/ShellHudGrid',()=>({ShellHudGrid:({pane}:any)=>pane}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:()=>{},dismiss:()=>{}})}));
import {CanastaGame} from '@/components/canasta/CanastaGame';
import {createMatch,startHand,pause,resume,project,assertConservation} from '@/lib/canasta/engine';
import {fixtureDeck} from '@/lib/canasta/rules';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(role:string){
 const initial=startHand(createMatch({id:id(5),sessionId:id(6),stake:10,realMoney:false,seats:[{id:id(1),userId:id(3),kind:'human',seat:1},{id:id(2),userId:id(4),kind:'human',seat:2}]},0),id(7),fixtureDeck(),0);
 const held=pause(initial,1000,'manual'),restored=resume(held,31000,held.pause!.episode);assertConservation(restored);
 const viewer=role==='actor'?initial.hand!.active:initial.seats.find(s=>s.id!==initial.hand!.active)!.id;
 const wrap=(m:typeof initial)=>({state:project(m,viewer),serverAt:m.updatedAt,settlement:null,finished:false});
 let value=wrap(held),notify=()=>{};const seen=vi.fn();
 const transport={load:vi.fn(async()=>value),send:vi.fn(async()=>value),subscribe:vi.fn((cb:()=>void)=>{notify=cb;return()=>{};})};
 return {transport,seen,held,restored,resume:()=>{value=wrap(restored);},notify:()=>notify(),stale:()=>{value=wrap(held);}};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1000);ui.editor=null;ui.timer=null;});afterEach(()=>{cleanup();vi.useRealTimers();});
for(const role of ['actor','observer']){
 it(`CONTRACT Canasta ${role} repairs missed resume without explicit reconnect`,async()=>{
  const f=fixture(role);render(<CanastaGame identity={null} transport={f.transport} onSnapshot={f.seen}/>);await act(async()=>{});expect(ui.editor.paused).toBe(true);f.resume();
  await act(()=>vi.advanceTimersByTimeAsync(30000));await act(async()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));
  appendFileSync('e2e/pauseAudit/evidence/phase2-observations.jsonl',JSON.stringify({game:'canasta',role,scenario:'dropped-resume-session-recovery',paused:ui.editor.paused,ready:ui.editor.ready,loads:f.transport.load.mock.calls.length,commands:f.transport.send.mock.calls.length})+'\n');
  expect(ui.editor.paused).toBe(false);
 });
 it(`CONTROL Canasta ${role} delivered resume preserves remaining clock and rejects stale pause`,async()=>{
  const f=fixture(role);render(<CanastaGame identity={null} transport={f.transport} onSnapshot={f.seen}/>);await act(async()=>{});
  const seconds=ui.editor.seconds;expect(ui.editor.ready).toBe(false);await act(()=>vi.advanceTimersByTimeAsync(30000));expect(ui.editor.seconds).toBe(seconds);
  f.resume();await act(async()=>f.notify());expect(ui.editor.paused).toBe(false);expect(ui.editor.seconds).toBe(seconds);expect(ui.editor.ready).toBe(role==='actor');
  await act(()=>vi.advanceTimersByTimeAsync(2000));expect(ui.editor.seconds).toBe(seconds-2);
  f.stale();await act(async()=>f.notify());expect(ui.editor.paused).toBe(false);expect(ui.editor.ready).toBe(role==='actor');expect(f.transport.send).not.toHaveBeenCalled();
 });
 it(`CONTROL Canasta ${role} explicit reconnect recovers without gameplay command`,async()=>{
  const f=fixture(role);render(<CanastaGame identity={null} transport={f.transport} onSnapshot={f.seen}/>);await act(async()=>{});f.resume();await act(async()=>ui.editor.reconnect());
  expect(ui.editor.paused).toBe(false);expect(ui.editor.ready).toBe(role==='actor');expect(f.transport.send).not.toHaveBeenCalled();
 });
}
