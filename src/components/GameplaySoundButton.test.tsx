// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {GameplaySoundButton} from './GameplaySoundButton';
import {CanonicalTableHeader} from '@/lib/canonicalShell/CanonicalTableHeader';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {VisualPreferences} from './VisualPreferences';
const state = vi.hoisted(() => ({manager:null as any}));
vi.mock('@/lib/audio/platformAudio', () => ({platformAudio:{
  subscribe:(listener:()=>void)=>state.manager.subscribe(listener), getSnapshot:()=>state.manager.getSnapshot(),
  acquireGameplay:()=>state.manager.acquireGameplay(),savePreference:(id:string,on:boolean)=>state.manager.savePreference(id,on),
}}));
vi.mock('@/lib/canonicalShell/CinematicPresentation',()=>({usePresentationSurfaceReady:()=>{}}));
vi.mock('@/lib/canonicalShell/ShellHudChrome',()=>({ShellAnnouncementRail:()=>null}));
vi.mock('@/components/delayed/PushPreferences',()=>({PushPreferences:()=>null}));
vi.mock('@/hooks/useVisualPreferences',()=>({TABLE_LAYOUTS:[],CARD_BACKS:[],FOUR_COLOR_SUITS:{},useVisualPreferences:()=>({refreshPreferences:vi.fn()})}));
vi.mock('@/hooks/useNetworkSim',()=>({useNetworkSim:()=>({refresh:vi.fn()})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{}})})})})}}));
let h: ReturnType<typeof audioHarness>;
beforeEach(async()=>{sessionStorage.clear();h=audioHarness();state.manager=h.manager;h.env.savePreference=vi.fn(async()=>{});await act(async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();});});
afterEach(()=>{cleanup();h.dispose();vi.restoreAllMocks();});
it('uses one immediate preference in both the header and global Settings, with existing profile persistence',async()=>{
  render(<><GameplaySoundButton/><VisualPreferences userId="user"/></>);
  await screen.findByRole('switch',{name:'Sound Effects'});
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Mute sounds'})));
  expect(screen.getByRole('button',{name:'Unmute sounds'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('switch',{name:'Sound Effects'}).getAttribute('aria-checked')).toBe('false');
  await act(async()=>fireEvent.click(screen.getByRole('switch',{name:'Sound Effects'})));
  expect(screen.getByRole('button',{name:'Mute sounds'})).toBeTruthy();
  expect(h.env.savePreference).toHaveBeenNthCalledWith(1,'user',false);expect(h.env.savePreference).toHaveBeenNthCalledWith(2,'user',true);
});
it('only renders the canonical control for active table gameplay',()=>{
  const ui=render(<CanonicalTableHeader title="Session"><button>Options</button></CanonicalTableHeader>);
  expect(screen.queryByRole('button',{name:'Mute sounds'})).toBeNull();
  ui.rerender(<CanonicalTableHeader gameplay title="Session"><button>Options</button></CanonicalTableHeader>);
  expect(screen.getByRole('button',{name:'Mute sounds'})).toBeTruthy();expect(screen.getByRole('button',{name:'Options'})).toBeTruthy();
});
it.each([{ready:false},{sessionEnded:true},{gameplay:false}])('hides fullscreen control outside ready gameplay: %j',props=>{
  render(<FullscreenGameShell {...props} title="Game" description="" activeTab="cards" setActiveTab={()=>{}} panel={null}><div>Board</div></FullscreenGameShell>);
  expect(screen.queryByRole('button',{name:'Mute sounds'})).toBeNull();
});
it('shows one fullscreen control while retaining navigation',()=>{
  render(<FullscreenGameShell title="Game" description="" activeTab="cards" setActiveTab={()=>{}} panel={null}><div>Board</div></FullscreenGameShell>);
  expect(screen.getAllByRole('button',{name:'Mute sounds'})).toHaveLength(1);expect(screen.getByRole('button',{name:'Chat'})).toBeTruthy();
});
