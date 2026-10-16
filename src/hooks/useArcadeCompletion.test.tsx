// @vitest-environment jsdom
import {act,renderHook,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),status:null as null|((s:string)=>void),change:null as null|(()=>void)}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:mocks.request}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>({on:(_a:unknown,_b:unknown,cb:()=>void)=>{mocks.change=cb;return {subscribe:(cb:(s:string)=>void)=>{mocks.status=cb;return {};}};}}),removeChannel:vi.fn()}}));
import {useArcadeRun} from './useArcadeRun';
const value=(status='active',revision=1)=>({id:'run',revision,status,serverAt:1000,view:{roundId:'round3',scorePresentation:status==='completed'?{startedAt:1000,endsAt:6000,from:50,to:100,playerId:'user'}:null},completion:status==='completed'?{kind:'broken',priorBest:50}:null,dueAt:null});
beforeEach(()=>{sessionStorage.clear();mocks.request.mockReset();mocks.request.mockResolvedValue(value());});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount=async()=>{const hook=renderHook(()=>useArcadeRun('run'));await act(async()=>{});return hook;};
it('admits a live completed result once and preserves its authoritative receipt',async()=>{
 const h=await mount();mocks.request.mockResolvedValue(value('completed',2));await act(async()=>h.result.current.act({type:'collect'}));
 expect(h.result.current.completionLive).toBe(true);expect(h.result.current.snapshot?.completion?.kind).toBe('broken');
 await act(async()=>h.result.current.refresh());expect(h.result.current.completionLive).toBe(true);
 h.unmount();const reloaded=await mount();expect(reloaded.result.current.completionLive).toBe(false);
});
it('does not admit an already completed initial load',async()=>{
 mocks.request.mockResolvedValue(value('completed',2));const h=await mount();expect(h.result.current.completedOnEntry).toBe(true);expect(h.result.current.completionLive).toBe(false);
});
it('reconnect catch-up cannot celebrate completion',async()=>{
 const h=await mount();mocks.request.mockResolvedValue(value('completed',2));
 await act(async()=>mocks.status?.('SUBSCRIBED'));expect(h.result.current.completionLive).toBe(false);
});
it('backgrounding retires an admitted presentation permanently',async()=>{
 const h=await mount();mocks.request.mockResolvedValue(value('completed',2));await act(async()=>h.result.current.act({type:'collect'}));
 expect(h.result.current.completionLive).toBe(true);
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(h.result.current.completionLive).toBe(false);await act(async()=>h.result.current.refresh());expect(h.result.current.completionLive).toBe(false);
});
it('a delayed response crossing an interruption cannot admit a celebration',async()=>{
 const h=await mount();let resolve!:(v:unknown)=>void;mocks.request.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 let pending!:Promise<void>;act(()=>{pending=h.result.current.act({type:'collect'});});
 act(()=>window.dispatchEvent(new Event('offline')));
 await act(async()=>{resolve(value('completed',2));await pending;});expect(h.result.current.completionLive).toBe(false);
});
