// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({present:vi.fn(),cancel:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{subscribe:()=>()=>{},getSnapshot:()=>({userId:'user',enabled:true}),present:audio.present}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
import {CHUCKY_HEARTBEAT_INTERVAL_MS,useChuckyRevealAudio} from './useChuckyRevealAudio';
const cue:any={durationMs:6000};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();vi.useRealTimers();});
it('starts only at an explicit first flip, once per hand, and cancels at completion',()=>{
 audio.present.mockImplementation((_event,started)=>started(audio.cancel));
 const h=renderHook(({id})=>useChuckyRevealAudio(id,cue),{initialProps:{id:'hand'}});
 expect(audio.present).not.toHaveBeenCalled();
 act(()=>h.result.current.start(document.body));act(()=>h.result.current.start(document.body));
 h.rerender({id:'hand'});expect(audio.present).toHaveBeenCalledOnce();
 act(()=>h.result.current.stop());expect(audio.cancel).toHaveBeenCalledOnce();
 h.rerender({id:'next'});act(()=>h.result.current.start(document.body));expect(audio.present).toHaveBeenCalledTimes(2);
});
it('retires interrupted sequences and consumes an edge whose audio is not loaded',()=>{
 const h=renderHook(()=>useChuckyRevealAudio('hand',cue));
 act(()=>window.dispatchEvent(new Event('offline')));act(()=>h.result.current.start(document.body));
 expect(audio.present).not.toHaveBeenCalled();h.unmount();
 audio.present.mockReturnValue(false);
 const disabled=renderHook(()=>useChuckyRevealAudio('new'));act(()=>disabled.result.current.start(document.body));
 expect(audio.present).toHaveBeenCalledWith({userId:'user',id:'chucky-reveal:new',cue:undefined},expect.any(Function));
 expect(disabled.result.current.active).toBe(false);
});

it('runs an independent rhythm and ends a complete beat before the final flip',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const times:number[]=[];
 audio.present.mockImplementation((_event,started)=>{times.push(performance.now());started?.(audio.cancel);return true;});
 const h=renderHook(()=>useChuckyRevealAudio('hand',()=>({durationMs:400} as any),true));
 act(()=>{h.result.current.armReveal(0,4,950);h.result.current.start(document.body);});
 act(()=>vi.advanceTimersByTime(1900));
 // The real scheduler arms the final flip after the penultimate card advances.
 act(()=>h.result.current.armReveal(3,4,950));
 h.rerender();act(()=>h.result.current.start(document.body));
 act(()=>vi.advanceTimersByTime(950));
 expect(times).toEqual([0,625,1250,1875]);
 expect(h.result.current.active).toBe(false);
 expect(times.at(-1)!+400).toBeLessThan(2850);
 act(()=>vi.advanceTimersByTime(5000));expect(audio.present).toHaveBeenCalledTimes(4);
});

it('does not continue a replayed or interrupted heartbeat sequence',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 audio.present.mockReturnValue(false);
 const replay=renderHook(()=>useChuckyRevealAudio('old',()=>({durationMs:400} as any),true));
 act(()=>replay.result.current.start(document.body));act(()=>vi.advanceTimersByTime(2000));
 expect(audio.present).toHaveBeenCalledOnce();replay.unmount();vi.clearAllMocks();
 audio.present.mockImplementation((_event,started)=>{started?.(audio.cancel);return true;});
 const live=renderHook(()=>useChuckyRevealAudio('live',()=>({durationMs:400} as any),true));
 act(()=>live.result.current.start(document.body));
 act(()=>window.dispatchEvent(new Event('offline')));
 act(()=>vi.advanceTimersByTime(5000));act(()=>live.result.current.start(document.body));
 expect(audio.present).toHaveBeenCalledOnce();expect(live.result.current.active).toBe(false);
});

it('stays silent when a full pair cannot finish before the final card',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 audio.present.mockReturnValue(false);
 const h=renderHook(()=>useChuckyRevealAudio('short',()=>({durationMs:400} as any),true));
 act(()=>{h.result.current.armReveal(0,1,200);h.result.current.start(document.body);});
 expect(audio.present).toHaveBeenCalledWith({userId:'user',id:'chucky-reveal:short'});
 expect(h.result.current.active).toBe(false);
});

it.each([0,20,80,100])('continues through card three with a %i ms native first-render delay',(renderDelay)=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const times:number[]=[];audio.present.mockImplementation((_event,started)=>{times.push(performance.now());started?.(audio.cancel);return true;});
 const h=renderHook(()=>useChuckyRevealAudio('configured',()=>({durationMs:400} as any),true));
 act(()=>h.result.current.armReveal(0,4,500));
 act(()=>vi.advanceTimersByTime(500));act(()=>h.result.current.armReveal(1,4,500));
 act(()=>vi.advanceTimersByTime(renderDelay));act(()=>h.result.current.start(document.body));
 act(()=>vi.advanceTimersByTime(500-renderDelay));act(()=>h.result.current.armReveal(2,4,500));
 act(()=>vi.advanceTimersByTime(500));act(()=>h.result.current.armReveal(3,4,800));
 act(()=>vi.advanceTimersByTime(800));
 expect(times).toEqual([500+renderDelay,1125+renderDelay,1750+renderDelay]);
 expect(times.at(-1)!+400).toBeGreaterThan(2100+renderDelay);
 expect(times.at(-1)!+400).toBeLessThanOrEqual(2300-40);
 expect(h.result.current.active).toBe(false);
});

it('keeps its tempo across four different delays without estimating an early ending',()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const times:number[]=[];audio.present.mockImplementation((_event,started)=>{times.push(performance.now());started?.(audio.cancel);return true;});
 const h=renderHook(()=>useChuckyRevealAudio('uneven',()=>({durationMs:400} as any),true));
 act(()=>h.result.current.armReveal(0,4,450));
 act(()=>vi.advanceTimersByTime(450));act(()=>h.result.current.armReveal(1,4,900));
 act(()=>vi.advanceTimersByTime(20));act(()=>h.result.current.start(document.body));
 act(()=>vi.advanceTimersByTime(880));act(()=>h.result.current.armReveal(2,4,1400));
 act(()=>vi.advanceTimersByTime(1400));act(()=>h.result.current.armReveal(3,4,1100));
 act(()=>vi.advanceTimersByTime(1100));
 expect(times).toEqual([470,1095,1720,2345,2970]);
 expect(times.at(-1)!+400).toBeGreaterThan(3350);
 expect(times.at(-1)!+400).toBeLessThan(3850);
});

it.each([80,250])('survives a %i ms foreground timer delay without a catch-up burst',(lateMs)=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const clock=performance.now.bind(performance);let lag=0;
 vi.spyOn(performance,'now').mockImplementation(()=>clock()+lag);
 const times:number[]=[];audio.present.mockImplementation((_event,started)=>{times.push(performance.now());started?.(audio.cancel);return true;});
 const h=renderHook(()=>useChuckyRevealAudio('delayed',()=>({durationMs:400} as any),true));
 act(()=>h.result.current.start(document.body));lag=lateMs;
 act(()=>vi.advanceTimersByTime(CHUCKY_HEARTBEAT_INTERVAL_MS));
 expect(times).toEqual(lateMs===80?[0,705]:[0]);
 act(()=>vi.advanceTimersByTime(CHUCKY_HEARTBEAT_INTERVAL_MS-lateMs));
 expect(times.at(-1)).toBe(1250);
 expect(h.result.current.active).toBe(true);
 act(()=>h.result.current.stop());act(()=>vi.advanceTimersByTime(5000));
 expect(times.at(-1)).toBe(1250);
});
