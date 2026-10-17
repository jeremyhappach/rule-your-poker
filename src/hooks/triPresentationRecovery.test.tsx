// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useArcadeRun} from './useArcadeRun';
import {useTriTowers} from './useTriTowers';
import type {TriArcadeSnapshot} from '@/lib/arcade/model';
const io=vi.hoisted(()=>({arcade:vi.fn(),tri:vi.fn(),publish:()=>{}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:io.arcade}));
vi.mock('@/lib/triTowers/client',()=>({triTowersRpc:io.tri,submit:vi.fn(),acceptSnapshot:(_old:any,value:any)=>value}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const ch={on:(_event:any,_filter:any,cb:()=>void)=>{io.publish=cb;return ch;},subscribe:()=>ch};return ch;},removeChannel:vi.fn()}}));
const flush=async()=>{await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});};
const arcade=(revision:number,phase='playing')=>({id:'run',revision,status:'active',serverAt:1000,view:{phase,roundId:'r'},dueAt:null});
const tri=(revision:number,phase='playing')=>({identity:{dealerGameId:'dealer'},revision,phase,serverAt:1000});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});Object.defineProperty(document,'hidden',{configurable:true,value:false});io.arcade.mockResolvedValue(arcade(1));io.tri.mockResolvedValue(tri(1));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('Arcade tags the recovered result response even while the old playing frame stayed mounted',async()=>{
 const h=renderHook(()=>useArcadeRun<TriArcadeSnapshot>('run',true));await flush();expect(h.result.current.presentationEpoch).toBe(0);
 io.arcade.mockResolvedValue(arcade(2,'stage_complete'));act(()=>window.dispatchEvent(new Event('focus')));await flush();
 expect(h.result.current.snapshot?.view.phase).toBe('stage_complete');expect(h.result.current.presentationEpoch).toBeGreaterThanOrEqual(2);
});
it('multiplayer tags the recovered result response, without admitting it as a live completion',async()=>{
 const h=renderHook(()=>useTriTowers('dealer'));await flush();expect(h.result.current.presentationEpoch).toBe(0);
 io.tri.mockResolvedValue(tri(2,'stage_complete'));act(()=>window.dispatchEvent(new Event('focus')));await flush();
 expect(h.result.current.view?.phase).toBe('stage_complete');expect(h.result.current.presentationEpoch).toBeGreaterThanOrEqual(2);
});
it('ordinary Arcade realtime advancement retains live eligibility; Run21 does not opt into the new metadata',async()=>{
 const h=renderHook(()=>useArcadeRun('run',true));await flush();io.arcade.mockResolvedValue(arcade(2,'stage_complete'));act(()=>io.publish());await flush();expect(h.result.current.presentationEpoch).toBe(0);
 h.unmount();const run21=renderHook(()=>useArcadeRun('run'));await flush();act(()=>window.dispatchEvent(new Event('focus')));await flush();expect(run21.result.current.presentationEpoch).toBe(0);
});
