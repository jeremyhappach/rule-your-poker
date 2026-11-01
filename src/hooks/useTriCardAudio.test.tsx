// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useTriCardAudio} from './useTriCardAudio';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {cardPlayCue,cardPassCue} from '@/lib/audio/cardActionCues';
const audio = vi.hoisted(() => ({request:vi.fn()}));
vi.mock('@/lib/audio/platformAudio', () => ({platformAudio:audio}));
let h: ReturnType<typeof audioHarness>;
const base = {userId:'user',scope:'run:round:actor',epoch:0,active:true,replay:false,
  view:{cards:[5,6,7],removed:[] as number[],waste:4,stockRemaining:24,phase:'playing'}};
beforeEach(async () => {vi.useFakeTimers(); sessionStorage.clear(); h=audioHarness(); h.env.now=()=>performance.now(); audio.request.mockImplementation(e=>h.manager.request(e)); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();});
afterEach(() => {cleanup();h.dispose();vi.useRealTimers();vi.restoreAllMocks();audio.request.mockReset();});

it('plays once for confirmed card removal and stock draw without any animation or DOM geometry', () => {
  const ui=renderHook(p=>useTriCardAudio(p),{initialProps:base}); expect(h.starts()).toHaveLength(0);
  const removed={...base,view:{...base.view,removed:[0],waste:5}}; ui.rerender(removed);
  expect(h.starts()).toHaveLength(1); expect(audio.request.mock.lastCall?.[0].cue).toBe(cardPlayCue);
  ui.rerender({...removed,view:{...removed.view}}); expect(h.starts()).toHaveLength(1);
  ui.rerender({...removed,view:{...removed.view,waste:9,stockRemaining:23}}); expect(h.starts()).toHaveLength(3);
  expect(audio.request.mock.lastCall?.[0].cue).toBe(cardPassCue);
});
it.each(['scope','epoch','inactive','replay','batch','regressive'] as const)('does not play stale/recovered deltas: %s', mode => {
  const ui=renderHook(p=>useTriCardAudio(p),{initialProps:base});
  const next={...base,view:{...base.view,removed:[0],waste:5}};
  if(mode==='scope')next.scope='other'; if(mode==='epoch')next.epoch=1; if(mode==='inactive')next.active=false; if(mode==='replay')next.replay=true;
  if(mode==='batch')next.view.removed=[0,1]; if(mode==='regressive')next.view.stockRemaining=25;
  ui.rerender(next); expect(h.starts()).toHaveLength(0);
});
it('keeps the high-water mark and baselines again after background/offline', () => {
  const ui=renderHook(p=>useTriCardAudio(p),{initialProps:base});const next={...base,view:{...base.view,removed:[0],waste:5}};
  ui.rerender(next);ui.rerender(base);ui.rerender(next);expect(h.starts()).toHaveLength(1);
  act(()=>window.dispatchEvent(new Event('offline')));ui.rerender({...next,view:{...next.view,removed:[0,1],waste:6}});expect(h.starts()).toHaveLength(1);
});
it('never catches up a muted card; subsequent cards work immediately without a round reset', () => {
  const ui=renderHook(p=>useTriCardAudio(p),{initialProps:base});h.manager.setPreference('user',false);
  const next={...base,view:{...base.view,removed:[0],waste:5}};ui.rerender(next);h.manager.setPreference('user',true);expect(h.starts()).toHaveLength(0);
  ui.rerender({...next,view:{...next.view,removed:[0,1],waste:6}});expect(h.starts()).toHaveLength(1);
});
