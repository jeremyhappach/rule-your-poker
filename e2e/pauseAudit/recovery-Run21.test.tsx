import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
import {fixtureMatch,act as play,PLAYERS,IDENTITY} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
const transport=vi.hoisted(()=>({fetch:vi.fn(),request:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/run21/localClient',async original=>({...await original<object>(),run21Fetch:transport.fetch,run21Request:transport.request}));
import {useRun21Local} from '@/hooks/useRun21Local';
import {dispatchAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
let streams:ReadableStreamDefaultController<Uint8Array>[]=[];
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();streams=[];});
afterEach(()=>{cleanup();for(const s of streams){try{s.close();}catch{}}vi.useRealTimers();});
for(const role of ['actor','observer'])it(`CONTROL Run21 ${role} simulated stream renewal catches missed resume; quiet stream does not`,async()=>{
 // Historical local engine fixture, not SQL or current-dealing qualification.
 const state=play(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0);
 const view=project(state,PLAYERS[role==='actor'?0:1].id);
 const paused={revision:1,serverAt:1000,view:{...view,pausedAt:1000},balances:{},finished:false,eventSequence:1};
 const resumed={...paused,revision:2,serverAt:31000,view:{...view,pausedAt:null},eventSequence:2};
 let value=paused;
 transport.fetch.mockImplementation(async()=>({ok:true,body:new ReadableStream({start(c){streams.push(c);c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));}})}));
 const h=renderHook(()=>useRun21Local(IDENTITY.sessionId,IDENTITY.dealerGameId));await act(async()=>{});expect(h.result.current.snapshot?.view.pausedAt).toBe(1000);expect(h.result.current.connected).toBe(true);value=resumed as any;
 await act(()=>vi.advanceTimersByTimeAsync(30000));
 const quietPaused=h.result.current.snapshot?.view.pausedAt;expect(quietPaused).toBe(1000);expect(transport.fetch).toHaveBeenCalledTimes(1);
 await act(async()=>dispatchAuthoritativeRecoverySnapshot('realtime_fallback'));expect(h.result.current.snapshot?.view.pausedAt).toBeNull();expect(transport.fetch).toHaveBeenCalledTimes(2);
 // Inject the server protocol edge explicitly. This does not execute its timer/handler.
 await act(async()=>{streams[1].enqueue(new TextEncoder().encode('event: renew\ndata: {}\n\n'));streams[1].close();});
 expect(transport.fetch).toHaveBeenCalledTimes(3);expect(h.result.current.snapshot?.view.pausedAt).toBeNull();expect(h.result.current.connected).toBe(true);expect(transport.request).not.toHaveBeenCalled();
 appendFileSync('e2e/pauseAudit/evidence/phase2-observations.jsonl',JSON.stringify({game:'run21',role,scenario:'quiet-then-injected-stream-renewal',quietPaused,quietMs:30000,resumedPausedAt:h.result.current.snapshot?.view.pausedAt,streams:transport.fetch.mock.calls.length,commands:transport.request.mock.calls.length,serverRenewalTimerExecuted:false})+'\n');
});
