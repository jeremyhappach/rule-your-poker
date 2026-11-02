// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({present:vi.fn(),cancel:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{subscribe:()=>()=>{},getSnapshot:()=>({userId:'user',enabled:true}),present:audio.present}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
import {useChuckyRevealAudio} from './useChuckyRevealAudio';
const cue:any={durationMs:6000};
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
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
 act(()=>vi.advanceTimersByTime(780));
 expect(times).toEqual([0,760,1520,2280]);
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

it.each([[500,800],[950,950],[1200,2000],[950,100]])('uses the actual card deadlines at %i/%i ms',(step,last)=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const times:number[]=[];audio.present.mockImplementation((_event,started)=>{times.push(performance.now());started?.(audio.cancel);return true;});
 const h=renderHook(()=>useChuckyRevealAudio('configured',()=>({durationMs:400} as any),true));
 act(()=>{h.result.current.armReveal(1,4,step,last);h.result.current.start(document.body);});
 act(()=>vi.advanceTimersByTime(step*2));act(()=>h.result.current.armReveal(3,4,last));
 act(()=>vi.advanceTimersByTime(last+1000));
 expect(times.length).toBeGreaterThan(1);
 expect(times[1]-times[0]).toBeLessThan(step);
 expect(times[times.length-1]+400).toBeLessThanOrEqual(step*2+last-80);
});
