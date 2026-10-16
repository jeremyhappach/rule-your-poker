// @vitest-environment jsdom
import {cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const mock=vi.hoisted(()=>({preference:vi.fn(),strike:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:mock.preference})})})}}));
vi.mock('@/lib/run21/boxingBell',()=>({strikeBoxingBell:mock.strike}));
import {useRun21Bell} from './useRun21Bell';
beforeEach(()=>{
  mock.preference.mockResolvedValue({data:{play_sounds:true}});
  vi.stubGlobal('AudioContext',class {state='running';close=()=>Promise.resolve();});
});
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
it('rings once across rerenders and remount/reconnect, then rings for the next player identity',async()=>{
  const first=renderHook(({key})=>useRun21Bell('user',key),{initialProps:{key:'round:player-a'}});
  await waitFor(()=>expect(mock.strike).toHaveBeenCalledTimes(1));
  first.rerender({key:'round:player-a'});first.unmount();
  const second=renderHook(({key})=>useRun21Bell('user',key),{initialProps:{key:'round:player-a'}});
  expect(mock.strike).toHaveBeenCalledTimes(1);
  second.rerender({key:'round:player-b'});
  await waitFor(()=>expect(mock.strike).toHaveBeenCalledTimes(2));
});
it('honors mute and checks a changed preference on the next round',async()=>{
  mock.preference.mockResolvedValue({data:{play_sounds:false}});
  const h=renderHook(({key})=>useRun21Bell('user',key),{initialProps:{key:'one'}});
  await waitFor(()=>expect(mock.preference).toHaveBeenCalledTimes(1));expect(mock.strike).not.toHaveBeenCalled();
  mock.preference.mockResolvedValue({data:{play_sounds:true}});h.rerender({key:'two'});
  await waitFor(()=>expect(mock.strike).toHaveBeenCalledTimes(1));
});
it('does not play late when preference loading completes after the overlay releases',async()=>{
  let resolve!:(value:unknown)=>void;mock.preference.mockReturnValue(new Promise(r=>{resolve=r;}));
  const h=renderHook(({key}:{key:string|null})=>useRun21Bell('user',key),{initialProps:{key:'one' as string|null}});
  h.rerender({key:null});resolve({data:{play_sounds:true}});
  await Promise.resolve();expect(mock.strike).not.toHaveBeenCalled();
});
it('fails silently when the preference request fails',async()=>{
  mock.preference.mockRejectedValue(new Error('offline'));
  renderHook(()=>useRun21Bell('user','one'));
  await waitFor(()=>expect(mock.preference).toHaveBeenCalledTimes(1));expect(mock.strike).not.toHaveBeenCalled();
});
