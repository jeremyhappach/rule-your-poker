// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({present:vi.fn(),beat:vi.fn((beat:string)=>({beat})),visible:vi.fn(()=>true)}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{getSnapshot:()=>({userId:'user'}),present:audio.present}}));
vi.mock('@/lib/audio/approvedSounds',()=>({approvedCountdownBeat:audio.beat}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:audio.visible}));
import {useDecisionCountdownAudio} from './useDecisionCountdownAudio';
const surface={current:document.body},clock=(id='round')=>({window:{id},serverOffsetMs:0}) as any;
const frame=(beat:string)=>({beat,active:beat!=='expired'}) as any;
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('plays one exact tone per displayed number and keeps DROP silent',()=>{
 const h=renderHook(({beat,visible})=>useDecisionCountdownAudio(clock(),frame(beat),visible,surface),{initialProps:{beat:'locked',visible:true}});
 for(const beat of ['3','3','2','2','1','DROP','hold','expired'])h.rerender({beat,visible:true});
 expect(audio.present.mock.calls.map(c=>c[0].cue.beat)).toEqual(['3','2','1']);
 expect(audio.present.mock.calls.map(c=>c[0].id)).toEqual(['357-countdown:round:3','357-countdown:round:2','357-countdown:round:1']);
});
it('does not reconstruct a mid-count mount or catch up a hidden beat',()=>{
 const h=renderHook(({beat})=>useDecisionCountdownAudio(clock(),frame(beat),true,surface),{initialProps:{beat:'2'}});
 h.rerender({beat:'1'});expect(audio.present).not.toHaveBeenCalled();h.unmount();
 const live=renderHook(({beat,visible})=>useDecisionCountdownAudio(clock('new'),frame(beat),visible,surface),{initialProps:{beat:'locked',visible:true}});
 live.rerender({beat:'3',visible:false});expect(audio.present.mock.lastCall?.[0].cue).toBeUndefined();
 live.rerender({beat:'3',visible:true});expect(audio.present).toHaveBeenCalledOnce();
 act(()=>window.dispatchEvent(new Event('offline')));live.rerender({beat:'2',visible:true});expect(audio.present).toHaveBeenCalledOnce();
});
