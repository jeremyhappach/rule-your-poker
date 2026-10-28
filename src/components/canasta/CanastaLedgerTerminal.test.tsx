// @vitest-environment jsdom
import {useEffect} from 'react';
import {ChipTransportProvider} from '@/lib/canonicalShell/ChipTransportProvider';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,act,cleanup,renderHook} from '@testing-library/react';
import {CanastaTable,isCanastaTerminalBatch} from './CanastaTable';
import {useRun21PresentationRetention} from '@/hooks/useRun21PresentationRetention';
import {createMatch,startHand,project} from '@/lib/canasta/engine';
import {fixtureDeck} from '@/lib/canasta/rules';
import type {Snapshot} from '@/lib/canasta/client';
vi.mock('@/hooks/useCanastaHelpers',()=>({useCanastaHelpers:()=>({helpers:true,setHelpers:vi.fn(),error:''})}));
const ui=vi.hoisted(()=>({snapshot:null as Snapshot|null,cursor:'pending',emit:vi.fn(),celebrate:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{const result={data:table==='gameplay_transfer_batches'?[ui.snapshot?.settlement?.batch]:table==='players'?[]:null};const q={select:()=>q,eq:()=>q,maybeSingle:()=>Promise.resolve(result),then:(resolve:any)=>Promise.resolve(result).then(resolve)};return q;},channel:()=>{const c={on:()=>c,subscribe:(cb:any)=>{cb('SUBSCRIBED');return c;}};return c;},removeChannel:vi.fn()}}));
vi.mock('./CanastaGame',()=>({CanastaGame:({onSnapshot,ended}:{onSnapshot:(s:Snapshot)=>void;ended:boolean})=>{useEffect(()=>{if(ui.snapshot)onSnapshot(ui.snapshot);},[ui.snapshot,onSnapshot]);return <div>{ended?'Session Ended':'Table retained'}</div>;}}));
vi.mock('./CanastaArtifacts',()=>({CanastaArtifacts:({ended}:{ended:boolean})=><div>{ended?'Results only':'Gameplay artifacts'}</div>}));
vi.mock('./useCanastaCardPresentation',()=>({useCanastaCardPresentation:()=>{}}));
vi.mock('@/lib/canonicalShell/CanonicalPlayerIdentityRow',()=>({CanonicalPlayerIdentityRow:()=>null}));
vi.mock('@/lib/canonicalShell/ShellTabBar',()=>({useShellTabBar:()=>{}}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:ui.emit})}));

vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:ui.celebrate}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({allMessages:[]})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
const id=(n:number)=>`61000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const snapshot=():Snapshot=>({state:project(startHand(createMatch({id:id(1),sessionId:id(2),stake:10,realMoney:false,seats:[{id:id(3),userId:id(5),kind:'human',seat:1},{id:id(4),userId:id(6),kind:'human',seat:5}]},0),id(7),fixtureDeck(),0),id(3)),serverAt:1000,firstRoundId:id(7),settlement:null,finished:false});
afterEach(()=>{cleanup();vi.useRealTimers();ui.emit.mockClear();ui.celebrate.mockClear();ui.cursor='pending';});
describe('Canasta real ledger terminal integration',()=>{it('releases after the real provider reconciles its historical terminal cursor',async()=>{
 const v=snapshot(),batch={id:id(9),game_id:id(2),dealer_game_id:id(1),cursor:2,reason:'win' as const,transfers:[{id:id(10),from:{kind:'player' as const,playerId:id(4)},to:{kind:'player' as const,playerId:id(3)},amount:10}],opening_balances:{['player:'+id(3)]:100,['player:'+id(4)]:100},closing_balances:{['player:'+id(3)]:110,['player:'+id(4)]:90}};
 ui.snapshot={...v,serverAt:Date.now(),finished:true,state:{...v.state,revision:3,winner:id(3)},settlement:{key:'terminal',resultId:id(8),transferBatchId:id(9),winner:id(3),loser:id(4),amount:10,scores:{[id(3)]:5100,[id(4)]:-10},startedAt:0,deadline:1,batch}};
 const complete=vi.fn();await act(async()=>{render(<ChipTransportProvider gameId={id(2)} gameType="canasta"><CanastaTable dealerGameId={id(1)} userId={id(5)} players={[]} activeTab="cards" setActiveTab={()=>{}} sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={complete} transport={{load:vi.fn(),send:vi.fn(),subscribe:()=>()=>{}}}/></ChipTransportProvider>);});
 expect(complete).toHaveBeenCalledExactlyOnceWith('canasta|winseq|'+id(2)+'|'+id(1)+'|1|'+id(8)+'|'+id(7));
});});
