// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const sound=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:sound}));
import {useHolmFoldAudio} from './useHolmFoldAudio';
afterEach(()=>{cleanup();sound.mockClear();});
const surface={current:document.body},p=(decision:string|null)=>[{id:'player-uuid',current_decision:decision}];
it('sounds the new folded player once and resets at exact hand identity',()=>{
 const h=renderHook(({scope,players,active})=>useHolmFoldAudio(scope,players,active,surface),{initialProps:{scope:'dealer:hand1',players:p(null),active:true}});
 h.rerender({scope:'dealer:hand1',players:p('fold'),active:true});expect(sound).toHaveBeenCalledWith('slide','holm:fold:dealer:hand1:player-uuid',document.body);
 h.rerender({scope:'dealer:hand1',players:p('fold'),active:true});h.rerender({scope:'dealer:hand2',players:p('fold'),active:true});expect(sound).toHaveBeenCalledOnce();
});
it('never plays initial history, unseen players, tab catch-up or an interrupted hand',()=>{
 const h=renderHook(({players,active})=>useHolmFoldAudio('hand',players,active,surface),{initialProps:{players:p('fold'),active:true}});
 expect(sound).not.toHaveBeenCalled();h.rerender({players:[...p('fold'),{id:'joined',current_decision:'fold'}],active:true});expect(sound).not.toHaveBeenCalled();
 h.rerender({players:p(null),active:false});h.rerender({players:p('fold'),active:false});h.rerender({players:p('fold'),active:true});expect(sound).not.toHaveBeenCalled();
 h.rerender({players:p(null),active:true});act(()=>window.dispatchEvent(new Event('offline')));act(()=>window.dispatchEvent(new Event('online')));h.rerender({players:p('fold'),active:true});expect(sound).not.toHaveBeenCalled();
});
