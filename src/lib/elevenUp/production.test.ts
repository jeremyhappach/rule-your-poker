import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-only'}}})}}}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({useChipPresentationCursorState:vi.fn(),useChipTransferPresentationAdmission:vi.fn()}));
import {arcadeRequest} from '@/lib/arcade/client';
import {isElevenTerminalBatch} from '@/components/elevenUp/useElevenFinancial';
import {acceptElevenSnapshot,arcadeSnapshot,type ElevenSnapshot} from './model';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import {resolvePresentationMode} from '@/lib/canonicalShell/presentationMode';
import {isCanonicalShellFamily} from '@/lib/canonicalShell/shellRouting';
afterEach(()=>vi.unstubAllGlobals());
it('sends the frozen 11 Up presentation version while preserving accepted games',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
 for(const game of ['eleven-up','run21','tri-towers'])await arcadeRequest({op:'state',game,runId:'run'});
 expect(fetcher.mock.calls.map(c=>JSON.parse((c as unknown as [string,RequestInit])[1].body as string).presentationVersion)).toEqual([1,4,4]);
});
it('distinguishes a definitive SQL rejection from an uncertain HTTP failure',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"error":"arcade:stale_action"}',{status:409})));
 await expect(arcadeRequest({game:'eleven-up',op:'action'})).rejects.toThrow('arcade:stale_action');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"error":"arcade:stale_action"}',{status:503})));
 await expect(arcadeRequest({game:'eleven-up',op:'action'})).rejects.toThrow('uncertain');
});
const batch={id:'batch',game_id:'session',dealer_game_id:'dealer',cursor:1,transfers:[{from:{kind:'player',playerId:'b'},to:{kind:'player',playerId:'a'},amount:5}]} as ChipPresentationBatch;
const view:ElevenSnapshot={...arcadeSnapshot({id:'dealer',revision:1,serverAt:10,status:'active',score:10,view:{roundId:'round',round:2,phase:'complete'}},'owner'),solo:false,identity:{sessionId:'session',dealerGameId:'dealer',roundId:'round'},financial:{resultId:'result',batch,balances:{a:105,b:95}},settlement:{a:5,b:-5},players:[{id:'a',name:'A',score:10,active:false,chips:105},{id:'b',name:'B',score:0,active:false,chips:95}]};
it('admits only matching canonical transfers with exact settled deltas',()=>{
 expect(isElevenTerminalBatch(batch,view)).toBe(true);
 expect(isElevenTerminalBatch({...batch,dealer_game_id:'other'},view)).toBe(false);
 expect(isElevenTerminalBatch({...batch,transfers:[{...batch.transfers[0],amount:4}]},view)).toBe(false);
 expect(isElevenTerminalBatch(batch,{...view,settlement:null})).toBe(false);
 expect(isElevenTerminalBatch(batch,{...view,financial:{...view.financial!,resultId:null}})).toBe(false);
});
it('allows a deferred financial batch at equal gameplay progress without accepting score drift',()=>{
 const before={...view,financial:{...view.financial!,batch:null}};
 expect(acceptElevenSnapshot(before,view,view.id)).toBe(view);
 expect(()=>acceptElevenSnapshot(before,{...view,players:[{...view.players[0],score:11},view.players[1]]},view.id)).toThrow('conflicting');
});
it('uses the canonical fullscreen shell through gameplay and Session Ended',()=>{
 const catalog=[{game_type:'eleven-up',presentation_mode:'fullscreen'}];
 expect(isCanonicalShellFamily('eleven-up')).toBe(true);
 expect(resolvePresentationMode(catalog,'eleven-up','dealer','in_progress')).toBe('fullscreen');
 expect(resolvePresentationMode(catalog,'eleven-up','dealer','session_ended',true)).toBe('fullscreen');
 expect(resolvePresentationMode(catalog,'eleven-up',null,'game_selection')).toBe('table');
});
