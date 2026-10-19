// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {beginRun21Timing,run21RoundTiming,run21SnapshotTiming,run21Timing,run21TimingEnabled,run21TimingPayload} from './diagnostics';
import {startRun21TimingCapture} from './timingCapture';
import {fixtureMatch,PLAYERS} from './fixtures';
import {project} from './engine';
let disconnect:ReturnType<typeof vi.fn>,stop:(()=>void)|undefined;
beforeEach(()=>{vi.useFakeTimers();disconnect=vi.fn();vi.stubGlobal('PerformanceObserver',class{observe(){} disconnect=disconnect;});});
afterEach(()=>{stop?.();stop=undefined;vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('captures three rounds automatically, sanitizes evidence, batches off the move path and stops at expiry',async()=>{
 const save=vi.fn(async(_samples:any[][],_signal:AbortSignal)=>{}),writes=vi.spyOn(Storage.prototype,'setItem'),request=vi.spyOn(window,'fetch');
 const now=Date.now();stop=startRun21TimingCapture({serverNow:now,expiresAt:now+90001},save);
 for(let round=1;round<=3;round++){
  run21RoundTiming(round);
  for(let i=0;i<200;i++)run21Timing('intent','private-identity');
 }
 run21Timing('response-headers','private-identity',undefined,'{"sentAt":120,"receivedAt":100,"secret":"hidden card","rpc":[{"name":"anything","startedAt":101,"completedAt":115}],"phases":[{"name":"tokenVerification","startedAt":100,"completedAt":102}]}');
 expect(save).not.toHaveBeenCalled();expect(writes).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(30010);
 expect(save).toHaveBeenCalledTimes(1);
 const payload=save.mock.calls[0][0];expect(new Set(payload.map((s:any)=>s[4]))).toEqual(new Set([0,1,2,3]));
 expect(JSON.stringify(payload)).not.toMatch(/private-identity|hidden card|anything|secret/);
 expect(payload.at(-1)[6]).toEqual({total:20,database:14,auth:2});
 await vi.advanceTimersByTimeAsync(60000);
 expect(run21TimingEnabled()).toBe(false);expect(disconnect).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 window.dispatchEvent(new Event('online'));run21Timing('intent','after-expiry');expect(window.__RUN21_TIMINGS__).toBeUndefined();
});
it('keeps one bounded window while offline, prevents overlapping uploads, and cleans up on unmount',async()=>{
 const save=vi.fn((_samples:unknown[][],signal:AbortSignal)=>new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
 stop=startRun21TimingCapture({serverNow:Date.now(),expiresAt:Date.now()+120000},save);
 for(let i=0;i<3000;i++)run21Timing('intent',String(i));expect(window.__RUN21_TIMINGS__).toHaveLength(2400);
 await vi.advanceTimersByTimeAsync(30010);expect(save).toHaveBeenCalledTimes(1);
 const signal=save.mock.calls[0][1];stop();expect(signal.aborted).toBe(true);
 await vi.advanceTimersByTimeAsync(120000);expect(save).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);expect(disconnect).toHaveBeenCalledTimes(1);
});
it('correlates realtime-first paint with the command without serializing the projection',()=>{
 stop=beginRun21Timing(Date.now(),Date.now()+60000);
 const view=project(fixtureMatch(),PLAYERS[0].id),key=JSON.stringify([view.identity,view.roundId,view.viewerId])+':'+view.boards[view.viewerId!]!.revision;
 Object.defineProperty(view,'secret',{enumerable:true,get(){throw Error('board serialization forbidden');}});
 run21Timing('confirmed-dom',key);run21SnapshotTiming('command',view);
 expect(window.__RUN21_TIMINGS__![0].id).toBe('command');expect(run21TimingPayload()).toHaveLength(3);
});
it('does not capture after expiry even before the expiry timer gets CPU time',()=>{
 const now=Date.now();stop=startRun21TimingCapture({serverNow:now,expiresAt:now+1000},vi.fn());
 vi.setSystemTime(now+2000);run21Timing('intent','late');expect(window.__RUN21_TIMINGS__).toHaveLength(1);expect(run21TimingEnabled()).toBe(false);
});
