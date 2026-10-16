// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {TriTowersView} from './TriTowersView';
import {create,project} from '@/lib/triTowers/referenceEngine';
import rules from '@/lib/triTowers/rules-v2.json';
import {isTriTowersTerminalBatch} from './useTriTowersFinancialPresentation';
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=> <span>Card</span>}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:(p:any)=><div>{p.scores}{p.timer}{p.actions}{p.children}</div>}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({usePresentationPlayerChipBalance:(_id:string,n:number)=>n,useChipPresentationCursorState:()=> 'settled',useChipTransferPresentationAdmission:()=>{}}));
globalThis.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
afterEach(cleanup);
const view=()=>{const s=create({sessionId:'s',dealerGameId:'d',roundId:'r'},[{id:'a',userId:'u',name:'A',seat:1},{id:'b',userId:'v',name:'B',seat:2}],Array.from({length:52},(_,i)=>i),0);s.rules=rules;s.waste=4;return project(s,'a');};
const renderView=(v:ReturnType<typeof view>,onIntent=vi.fn())=>render(<TriTowersView view={v} now={1000} activeTab="cards" setActiveTab={()=>{}} panel={null} onIntent={onIntent}/>);
describe('TriTowers v2 visible controls',()=>{
 it('admits a legal first card in Ready without a Start control',()=>{
  const v=view(),act=vi.fn(),ui=renderView(v,act);
  expect(ui.queryByRole('button',{name:/Start/})).toBeNull();
  const card=ui.getByRole('button',{name:'Remove 6 of hearts'});expect((card as HTMLButtonElement).disabled).toBe(false);fireEvent.click(card);expect(act).toHaveBeenCalledWith({type:'remove',index:18});
  expect(ui.queryByRole('button',{name:'Take Score'})).toBeNull();
 });
 it('shows one Take Score only to the active human and never Give Up',()=>{
  const v={...view(),phase:'playing' as const,deadline:121000},ui=renderView(v);
  expect(ui.getAllByRole('button',{name:'Take Score'})).toHaveLength(1);expect(ui.queryByText(/Give up/i)).toBeNull();expect(ui.getByRole('progressbar')).toBeTruthy();
  cleanup();const watcher=renderView({...v,viewerId:'b',canAct:false});expect(watcher.queryByRole('button',{name:'Take Score'})).toBeNull();
 });
 it('displays canonical balances separately from competition points',()=>{
  const ui=renderView({...view(),financial:{balances:{a:-10,b:10},resultId:null,batch:null}});
  expect(ui.getByLabelText('A balance -10')).toBeTruthy();expect(ui.getByLabelText('B balance 10')).toBeTruthy();
 });
 it('admits only an exact canonical terminal transfer with matching deltas',()=>{
  const batch:any={id:'batch',game_id:'s',dealer_game_id:'d',cursor:1,transfers:[{id:'t',amount:5,from:{kind:'player',playerId:'a'},to:{kind:'player',playerId:'b'}}]};
  const v={...view(),settlement:{a:-5,b:5},financial:{balances:{a:95,b:105},resultId:'result',batch}};
  expect(isTriTowersTerminalBatch(batch,v)).toBe(true);
  expect(isTriTowersTerminalBatch({...batch,id:'old'},v)).toBe(false);
  expect(isTriTowersTerminalBatch({...batch,transfers:[{...batch.transfers[0],amount:10}]},v)).toBe(false);
 });
});
