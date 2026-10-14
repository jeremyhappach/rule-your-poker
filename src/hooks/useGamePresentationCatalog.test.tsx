// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({select:vi.fn()}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{from:()=>({select:mock.select})}}));
import { useGamePresentationCatalog } from './useGamePresentationCatalog';
afterEach(() => {cleanup();vi.clearAllMocks();});
it('loads once and ignores a delayed result from the previous route', async () => {
  let resolveOld!: (value: unknown) => void;
  mock.select.mockReturnValueOnce(new Promise(resolve => {resolveOld=resolve;}))
    .mockResolvedValueOnce({data:[{game_type:'holm',presentation_mode:'table'}],error:null});
  const ui=renderHook(({id})=>useGamePresentationCatalog(id),{initialProps:{id:'first'}});
  expect(ui.result.current).toEqual([]);
  ui.rerender({id:'second'});
  expect(ui.result.current).toEqual([]);
  await waitFor(()=>expect(ui.result.current[0]?.game_type).toBe('holm'));
  await act(async()=>resolveOld({data:[{game_type:'run21',presentation_mode:'fullscreen'}],error:null}));
  expect(ui.result.current[0]?.game_type).toBe('holm');
  ui.rerender({id:'second'});expect(mock.select).toHaveBeenCalledTimes(2);
});
it.each(['error','throw'])('fails safely on a catalog %s',async failure=>{
  if(failure==='error')mock.select.mockResolvedValue({data:null,error:{message:'unavailable'}});
  else mock.select.mockRejectedValue(new Error('offline'));
  const ui=renderHook(()=>useGamePresentationCatalog('session'));
  await act(async()=>{});expect(ui.result.current).toEqual([]);
});
