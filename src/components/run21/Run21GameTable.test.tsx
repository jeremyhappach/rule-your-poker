// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {fixtureMatch, IDENTITY, PLAYERS, uuid} from '@/lib/run21/fixtures';
import {project} from '@/lib/run21/engine';
import type {Run21Snapshot} from '@/lib/run21/localClient';
const terminal = vi.hoisted(()=>({cursor:'running',dispatch:vi.fn(),emit:vi.fn(),clearAmbient:vi.fn()}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:terminal.emit,clearAmbient:terminal.clearAmbient})}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({useChipTransport:()=>({dispatch:terminal.dispatch}),useChipPresentationCursorState:()=>terminal.cursor,useChipTransferPresentationAdmission:()=>{},usePresentationPlayerChipBalance:(_id:string,raw:number)=>raw}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>{
  const v=mock.snapshot!.view,r=v.settlement!;
  return {data:{id:r.transferBatchId,game_id:v.identity.sessionId,dealer_game_id:v.identity.dealerGameId,cursor:2,transfers:[{id:'canonical-entry',amount:r.amount,from:{kind:'player',playerId:r.loserId},to:{kind:'player',playerId:r.winnerId}}]}};
}};return query;}}}));
vi.mock('@/lib/canonicalShell/CanonicalPlayerIdentityRow',()=>({CanonicalPlayerIdentityRow:()=> <div data-canonical-player-identity/>}));
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
const mock = vi.hoisted(() => ({snapshot: null as Run21Snapshot | null, close: vi.fn().mockResolvedValue({closed: true})}));
vi.mock('@/hooks/useRun21Local', () => ({useRun21Local: () => ({snapshot: mock.snapshot, now: 0, connected: true})}));
vi.mock('@/hooks/GameChatContext', () => ({useGameChatContext: () => ({})}));
vi.mock('@/hooks/useRun21SafeFelt', () => ({useSafeFelt: () => ({area: {width: 0}, draw: {}})}));
vi.mock('@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement', () => ({useCanonicalFeltInteractionLayerElement: () => null}));
vi.mock('@/lib/canonicalShell/GameplayOpponentSeatLayer', () => ({GameplayOpponentSeatLayer: () => null}));
vi.mock('@/lib/canonicalShell/ShellHudGrid', () => ({ShellHudGrid: ({pane}: {pane: React.ReactNode}) => <div data-testid="hud">{pane}</div>}));
vi.mock('@/lib/canonicalShell/ShellTabBar', () => ({useShellTabBar: () => {}}));
vi.mock('@/components/canonicalShell/CanonicalChipDisc', () => ({CanonicalChipDisc: () => null}));
vi.mock('@/components/HandHistory', () => ({HandHistory: () => null}));
vi.mock('@/components/MobileChatPanel', () => ({MobileChatPanel: () => null}));
vi.mock('@/lib/run21/localClient', () => ({run21Request: (...args: unknown[]) => mock.close(...args)}));
vi.mock('./Run21Announcement', () => ({Run21Announcement: () => null}));
vi.mock('./Run21Felt', () => ({Run21Felt: () => null}));
vi.mock('./Run21Replay', () => ({Run21Replay: () => null}));
vi.mock('./Run21PlayerPane', () => ({Run21PlayerPane: () => null, Run21Timer: () => null}));
vi.mock('@/lib/canonicalShell/ShellHudChrome', () => ({ShellAnnouncementRail: () => null}));
import {Run21GameTable} from './Run21GameTable';
afterEach(cleanup);
it.each(['table','fullscreen'] as const)('does not reopen terminal presentation when close refreshes the same persisted receipt in %s', async presentationMode => {
  terminal.cursor='running';terminal.dispatch.mockClear();mock.close.mockClear();
  const view = project(fixtureMatch(), PLAYERS[0].id);
  view.revealed = true; view.winnerId = PLAYERS[1].id;view.cumulative={[PLAYERS[0].id]:105000,[PLAYERS[1].id]:135850};
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{fn(0);return 1;});
  view.settlement = {key: 'test-receipt', resultId: uuid(presentationMode==='table'?500:502), transferBatchId: uuid(501), winnerId: PLAYERS[1].id, loserId: PLAYERS[0].id, amount: 5, at: 10};
  mock.snapshot = {view, revision: 1, serverAt: 10, finished: false, balances: {[PLAYERS[0].id]: -5, [PLAYERS[1].id]: 5}};
  const onTerminalActive = vi.fn(), onTerminalComplete = vi.fn();
  const props = {presentationMode, gameId: IDENTITY.sessionId, dealerGameId: IDENTITY.dealerGameId, userId: uuid(30), dealerPosition: 1,
    activeTab: 'cards' as const, setActiveTab: vi.fn(), sessionEnded: false, onTerminalActive, onTerminalComplete};
  let ui = render(<Run21GameTable {...props}/>);
  expect(onTerminalActive.mock.calls).toEqual([[true]]);
  expect(screen.queryByRole('button',{name:'Finish match'})).toBeNull();
  expect(screen.getByRole('table',{name:'Run21 match scores'}).textContent).toContain('105,000');
  expect(terminal.emit).toHaveBeenCalledWith(expect.objectContaining({type:'match_win'}));
  expect(terminal.dispatch).not.toHaveBeenCalled();
  expect(mock.close).not.toHaveBeenCalled();
  ui.unmount();ui=render(<Run21GameTable {...props}/>);
  expect(mock.close).not.toHaveBeenCalled();
  terminal.cursor='settled';ui.rerender(<Run21GameTable {...props}/>);
  await waitFor(() => expect(onTerminalComplete).toHaveBeenCalledWith(`run21|winseq|${IDENTITY.sessionId}|${IDENTITY.dealerGameId}|1|${view.settlement.resultId}|${view.roundId}`));
  mock.snapshot = JSON.parse(JSON.stringify({...mock.snapshot, finished: true}));
  ui.rerender(<Run21GameTable {...props}/>);
  expect(onTerminalActive.mock.calls).toEqual([[true], [true], [false]]);
  expect(mock.close).toHaveBeenCalledWith(IDENTITY.sessionId, `close?dealerGameId=${IDENTITY.dealerGameId}`, {});
  ui.rerender(<Run21GameTable {...props} sessionEnded/>);
  expect(screen.queryByRole('button', {name: 'Finish match'})).toBeNull();
  ui.unmount();render(<Run21GameTable {...props}/>);
  expect(mock.close).toHaveBeenCalledTimes(1);expect(onTerminalComplete).toHaveBeenCalledTimes(2);
}, 15000);

it('retains the same HUD element and fixed felt allocation from preparation into play',()=>{
 const props={gameId:IDENTITY.sessionId,dealerGameId:IDENTITY.dealerGameId,userId:uuid(30),dealerPosition:1,activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:vi.fn()};
 mock.snapshot=null;const ui=render(<Run21GameTable {...props}/>),hud=screen.getByTestId('hud');
 const fixed=ui.container.querySelector('[style*="--shell-felt-h"]') as HTMLElement;
 mock.snapshot={view:project(fixtureMatch(),PLAYERS[0].id),revision:1,serverAt:0,finished:false,balances:{}};ui.rerender(<Run21GameTable {...props}/>);
 expect(screen.getByTestId('hud')).toBe(hud);expect(ui.container.querySelector('[style*="--shell-felt-h"]')).toBe(fixed);
});

it('reuses an in-flight close promise after remount and completes only the current viewer callback',async()=>{
 terminal.cursor='settled';mock.close.mockClear();
 let resolve!:()=>void;mock.close.mockImplementationOnce(()=>new Promise<void>(done=>{resolve=done;}));
 const view=project(fixtureMatch(),PLAYERS[0].id);view.revealed=true;view.winnerId=PLAYERS[1].id;
 view.cumulative={[PLAYERS[0].id]:105000,[PLAYERS[1].id]:135850};
 view.settlement={key:'pending-receipt',resultId:uuid(700),transferBatchId:uuid(701),winnerId:PLAYERS[1].id,loserId:PLAYERS[0].id,amount:5,at:10};
 mock.snapshot={view,revision:2,serverAt:10,finished:true,balances:{}};
 const old=vi.fn(),current=vi.fn();
 const props={gameId:IDENTITY.sessionId,dealerGameId:IDENTITY.dealerGameId,userId:uuid(30),dealerPosition:1,activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:old};
 const first=render(<Run21GameTable {...props}/>);await waitFor(()=>expect(mock.close).toHaveBeenCalledTimes(1));
 first.unmount();render(<Run21GameTable {...props} onTerminalComplete={current}/>);
 await waitFor(()=>expect(mock.close).toHaveBeenCalledTimes(1));resolve();
 await waitFor(()=>expect(current).toHaveBeenCalledTimes(1));expect(old).not.toHaveBeenCalled();
 expect(mock.close).toHaveBeenCalledTimes(1);
});
