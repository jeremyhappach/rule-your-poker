// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({present:vi.fn(),cancel:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{subscribe:()=>()=>{},getSnapshot:()=>({userId:'user',enabled:true}),present:audio.present}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>true}));
import {useChuckyRevealAudio} from './useChuckyRevealAudio';
const cue:any={durationMs:6000};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('starts only at an explicit first flip, once per hand, and cancels at completion',()=>{
 audio.present.mockImplementation((_event,started)=>started(audio.cancel));
 const h=renderHook(({id})=>useChuckyRevealAudio(id,cue),{initialProps:{id:'hand'}});
 expect(audio.present).not.toHaveBeenCalled();
 act(()=>h.result.current.start(document.body));act(()=>h.result.current.start(document.body));
 h.rerender({id:'hand'});expect(audio.present).toHaveBeenCalledOnce();
 act(()=>h.result.current.stop());expect(audio.cancel).toHaveBeenCalledOnce();
 h.rerender({id:'next'});act(()=>h.result.current.start(document.body));expect(audio.present).toHaveBeenCalledTimes(2);
});
it('retires interrupted sequences and ships no unapproved replacement',()=>{
 const h=renderHook(()=>useChuckyRevealAudio('hand',cue));
 act(()=>window.dispatchEvent(new Event('offline')));act(()=>h.result.current.start(document.body));
 expect(audio.present).not.toHaveBeenCalled();h.unmount();
 const disabled=renderHook(()=>useChuckyRevealAudio('new'));act(()=>disabled.result.current.start(document.body));
 expect(audio.present).not.toHaveBeenCalled();
});
