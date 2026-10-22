// @vitest-environment jsdom
import {useEffect} from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,act,cleanup,renderHook} from '@testing-library/react';
import {CanastaTable,isCanastaTerminalBatch} from './CanastaTable';
import {useRun21PresentationRetention} from '@/hooks/useRun21PresentationRetention';
import {createMatch,startHand,project} from '@/lib/canasta/engine';
import {fixtureDeck} from '@/lib/canasta/rules';
import type {Snapshot} from '@/lib/canasta/client';
vi.mock('@/hooks/useCanastaHelpers',()=>({useCanastaHelpers:()=>({helpers:true,setHelpers:vi.fn(),error:''})}));
const ui=vi.hoisted(()=>({snapshot:null as Snapshot|null,cursor:'pending',emit:vi.fn(),celebrate:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('./CanastaGame',()=>({CanastaGame:({onSnapshot,ended}:{onSnapshot:(s:Snapshot)=>void;ended:boolean})=>{useEffect(()=>{if(ui.snapshot)onSnapshot(ui.snapshot);},[ui.snapshot,onSnapshot]);return <div>{ended?'Session Ended':'Table retained'}</div>;}}));
vi.mock('./CanastaArtifacts',()=>({CanastaArtifacts:({ended}:{ended:boolean})=><div>{ended?'Results only':'Gameplay artifacts'}</div>}));
vi.mock('./useCanastaCardPresentation',()=>({useCanastaCardPresentation:()=>{}}));
vi.mock('@/lib/canonicalShell/CanonicalPlayerIdentityRow',()=>({CanonicalPlayerIdentityRow:()=>null}));
vi.mock('@/lib/canonicalShell/ShellTabBar',()=>({useShellTabBar:()=>{}}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:ui.emit})}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({useChipTransferPresentationAdmission:()=>{},useChipPresentationCursorState:()=>ui.cursor}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:ui.celebrate}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({allMessages:[]})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
const id=(n:number)=>`61000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const snapshot=():Snapshot=>({state:project(startHand(createMatch({id:id(1),sessionId:id(2),stake:10,realMoney:false,seats:[{id:id(3),userId:id(5),kind:'human',seat:1},{id:id(4),userId:id(6),kind:'human',seat:5}]},0),id(7),fixtureDeck(),0),id(3)),serverAt:1000,firstRoundId:id(7),settlement:null,finished:false});
afterEach(()=>{cleanup();vi.useRealTimers();ui.emit.mockClear();ui.celebrate.mockClear();ui.cursor='pending';});
describe('Canasta terminal ownership',()=>{
 it('waits for authoritative finish, server hold and canonical chip completion, then releases once',()=>{
  vi.useFakeTimers();vi.setSystemTime(1000);ui.snapshot=snapshot();const complete=vi.fn(),active=vi.fn();
  const props={dealerGameId:id(1),userId:id(5),players:[],activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:active,onTerminalComplete:complete,transport:{load:vi.fn(),send:vi.fn(),subscribe:()=>()=>{}}};
  const view=render(<CanastaTable {...props}/>);
  const s=ui.snapshot;ui.snapshot={...s,state:{...s.state,revision:2,winner:id(3)},settlement:{key:'canasta:'+id(1),resultId:id(8),transferBatchId:id(9),winner:id(3),loser:id(4),amount:10,scores:{[id(3)]:5100,[id(4)]:-100},startedAt:1000,deadline:4000,
   batch:{id:id(9),game_id:id(2),dealer_game_id:id(1),cursor:1,reason:'win',transfers:[{id:id(10),from:{kind:'player',playerId:id(4)},to:{kind:'player',playerId:id(3)},amount:10}],opening_balances:{},closing_balances:{}}}};
  expect(isCanastaTerminalBatch(ui.snapshot.settlement!.batch,ui.snapshot)).toBe(true);
  expect(isCanastaTerminalBatch({...ui.snapshot.settlement!.batch,dealer_game_id:id(11)},ui.snapshot)).toBe(false);
  view.rerender(<CanastaTable {...props}/>);expect(active).toHaveBeenCalledWith(true);expect(complete).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(3500));expect(complete).not.toHaveBeenCalled();
  ui.snapshot={...ui.snapshot,serverAt:Date.now(),finished:true,state:{...ui.snapshot.state,revision:3}};view.rerender(<CanastaTable {...props}/>);expect(complete).not.toHaveBeenCalled();
  ui.cursor='settled';view.rerender(<CanastaTable {...props}/>);expect(complete).toHaveBeenCalledExactlyOnceWith(`canasta|winseq|${id(2)}|${id(1)}|1|${id(8)}|${id(7)}`);
  view.rerender(<CanastaTable {...props} sessionEnded/>);expect(view.getByText('Results only')).toBeTruthy();expect(view.queryByText('Gameplay artifacts')).toBeNull();
  act(()=>vi.advanceTimersByTime(5000));expect(complete).toHaveBeenCalledTimes(1);
 });
 it('retains a later-hand reconnect with the match first round, rejects wrong tokens and does not retain a fresh ended entry',()=>{
  const first={dealerGameId:id(1),firstRoundId:id(7)},token=`canasta|winseq|${id(2)}|${id(1)}|1|${id(8)}|${id(7)}`;
  const hook=renderHook(({live})=>useRun21PresentationRetention(id(2),live,'canasta'),{initialProps:{live:first as typeof first|null}});
  hook.rerender({live:null});expect(hook.result.current.pending?.snapshot.firstRoundId).toBe(id(7));
  act(()=>{expect(hook.result.current.complete(token.replace(id(7),id(99)))).toBe(false);});
  act(()=>{expect(hook.result.current.complete(token)).toBe(true);});expect(hook.result.current.pending).toBeNull();
  hook.unmount();const cold=renderHook(()=>useRun21PresentationRetention(id(2),null,'canasta'));expect(cold.result.current.pending).toBeNull();
 });
});
