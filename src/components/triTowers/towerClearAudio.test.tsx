// @vitest-environment jsdom
import {StrictMode} from 'react';
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {useTriTowerClearAudio} from './useTriTowerClearAudio';
const audio=vi.hoisted(()=>({follow:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:audio}));
let h:ReturnType<typeof audioHarness>;
const ready=async()=>{await act(async()=>{for(let i=0;i<6;i++)await Promise.resolve();});};
const base={scope:'round:player',userId:'user',removed:[] as number[],phase:'playing',recoveryEpoch:0,active:true,reduced:false,replay:false};
beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(0);sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});h=audioHarness();audio.follow.mockReset().mockImplementation(e=>h.manager.follow(e));await ready();});
afterEach(()=>{cleanup();h.dispose();vi.useRealTimers();});
it('builds two trills in clear order, never adds a third tune, and dedupes repeated/regressive snapshots',async()=>{
 const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:base,wrapper:StrictMode});
 ui.rerender({...base,removed:[2]});const first=h.starts().length;expect(first).toBe(5);
 ui.rerender({...base,removed:[2,0]});await ready();expect(h.starts()).toHaveLength(first+14);
 ui.rerender({...base,removed:[2,0]});ui.rerender({...base,removed:[]});ui.rerender({...base,removed:[2,0]});
 ui.rerender({...base,removed:[2,0,1],phase:'stage_complete'});expect(h.starts()).toHaveLength(first+14);
 expect(new Set(audio.follow.mock.calls.map(([e])=>e.id))).toEqual(new Set(['tri-tower:round:player:2:1','tri-tower:round:player:0:2']));
});
it('admits every newly observed first/second clear in one snapshot without a third cue',()=>{
 const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:base});
 ui.rerender({...base,removed:[1,2,0],phase:'stage_complete'});expect(h.starts()).toHaveLength(19);
});
it('leaves scheduling headroom while the real audio clock advances',()=>{
 let clock=0;h.env.now=()=>clock++;
 const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:base});
 ui.rerender({...base,removed:[0]});expect(h.starts().length).toBeGreaterThan(0);
});
it.each(['mount','scope','recovery','inactive','reduced','replay','hidden','offline'] as const)('does not replay historical clears after %s',mode=>{
 const initial=mode==='mount'?{...base,removed:[2,0]}:base;
 const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:initial});
 let next={...base,removed:[2,0]};
 if(mode==='scope')next={...next,scope:'next-round'};
 if(mode==='recovery')next={...next,recoveryEpoch:1};
 if(mode==='inactive')next={...next,active:false};
 if(mode==='reduced')next={...next,reduced:true};
 if(mode==='replay')next={...next,replay:true};
 if(mode==='hidden')act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 if(mode==='offline')act(()=>window.dispatchEvent(new Event('offline')));
 ui.rerender(next);expect(h.starts()).toHaveLength(0);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 ui.rerender({...next,active:true,reduced:false,replay:false});expect(h.starts()).toHaveLength(0);
});
it('stops an active trill on pause, then starts only a newly cleared tower on resume',async()=>{
 const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:base});
 ui.rerender({...base,removed:[0]});ui.rerender({...base,removed:[0],active:false});await ready();
 expect(h.nodes.filter(n=>n.kind==='oscillator').every(n=>n.stop.mock.calls.length===2)).toBe(true);
 ui.rerender({...base,removed:[0]});ui.rerender({...base,removed:[0,1]});expect(h.starts()).toHaveLength(19);
});
it('respects mute and the browser lock, retiring rather than catching up expired cues',async()=>{
 h.manager.setPreference('user',false);const ui=renderHook(p=>useTriTowerClearAudio(p),{initialProps:base});
 ui.rerender({...base,removed:[0]});expect(h.starts()).toHaveLength(0);
 act(()=>vi.advanceTimersByTime(700));h.manager.setPreference('user',true);expect(h.starts()).toHaveLength(0);
 h.state('suspended');ui.rerender({...base,removed:[0,1]});expect(h.starts()).toHaveLength(0);
 act(()=>vi.advanceTimersByTime(700));h.state('running');expect(h.starts()).toHaveLength(0);
});
