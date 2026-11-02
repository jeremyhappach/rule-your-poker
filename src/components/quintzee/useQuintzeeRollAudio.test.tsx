// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/audio/diceRollSound',()=>({startRollSound:(...args:unknown[])=>{audio.start(...args);return audio.stop;}}));
import {useQuintzeeRollAudio} from './useQuintzeeRollAudio';
const surface={current:document.body};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('follows only the rumble lifetime and stops without a landing cue',()=>{
 const h=renderHook(({rumble})=>useQuintzeeRollAudio(rumble,true,surface),{initialProps:{rumble:null as {identity:string;held:number[]}|null}});
 expect(audio.start).not.toHaveBeenCalled();h.rerender({rumble:{identity:'round:2',held:[1]}});
 expect(audio.start).toHaveBeenCalledWith('quintzeeRoll','round:2',document.body);
 h.rerender({rumble:{identity:'round:2',held:[1,2]}});expect(audio.start).toHaveBeenCalledOnce();
 h.rerender({rumble:null});expect(audio.stop).toHaveBeenCalledOnce();
});
it('stops on interruption/unmount and skips a fully held roll',()=>{
 const h=renderHook(({held})=>useQuintzeeRollAudio({identity:'round:1',held},true,surface),{initialProps:{held:[] as number[]}});
 act(()=>window.dispatchEvent(new Event('offline')));expect(audio.stop).toHaveBeenCalledOnce();h.unmount();expect(audio.stop).toHaveBeenCalledTimes(2);
 audio.start.mockClear();renderHook(()=>useQuintzeeRollAudio({identity:'round:2',held:[0,1,2,3,4]},true,surface));expect(audio.start).not.toHaveBeenCalled();
});
