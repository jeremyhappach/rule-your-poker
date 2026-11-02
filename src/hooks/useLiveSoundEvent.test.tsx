// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const sound = vi.hoisted(() => vi.fn());
vi.mock('@/lib/audio/presentationSound', () => ({presentSound:sound}));
import {useLiveSoundEvent} from './useLiveSoundEvent';
afterEach(() => {cleanup();sound.mockClear();});
it('seeds history, waits for the exact visual receipt, then consumes once', () => {
  const h = renderHook(({id,ready}) => useLiveSoundEvent(id,ready,'sweep',()=>null), {initialProps:{id:'old',ready:true}});
  expect(sound).not.toHaveBeenCalled();
  h.rerender({id:'new',ready:false});expect(sound).not.toHaveBeenCalled();
  h.rerender({id:'new',ready:true});h.rerender({id:'new',ready:true});
  expect(sound.mock.calls).toEqual([['sweep','new',null]]);
  h.unmount();renderHook(()=>useLiveSoundEvent('new',true,'sweep',()=>null));
  expect(sound).toHaveBeenCalledTimes(1);
});
it('native animation receipts consume once, including an inaudible surface',()=>{
  const h=renderHook(({id})=>useLiveSoundEvent(id,false,'myLeg',()=>null),{initialProps:{id:null as string|null}});
  h.rerender({id:'dealer:round:player:leg'});
  act(()=>{h.result.current(null);h.result.current(document.body);});
  expect(sound.mock.calls).toEqual([['myLeg','dealer:round:player:leg',null]]);
});
it('retires interrupted pending audio and the recovery snapshot without catchup',()=>{
  const h=renderHook(({id,ready})=>useLiveSoundEvent(id,ready,'chucky',()=>null),{initialProps:{id:null as string|null,ready:false}});
  h.rerender({id:'hand1',ready:false});act(()=>window.dispatchEvent(new Event('offline')));
  h.rerender({id:'hand1',ready:true});h.rerender({id:'recoveredHand',ready:true});
  expect(sound).not.toHaveBeenCalled();
  h.rerender({id:'newLiveHand',ready:true});expect(sound).toHaveBeenCalledTimes(1);
});
