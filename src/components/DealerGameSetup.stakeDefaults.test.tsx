vi.mock('@/hooks/useQuintzeeAccess',()=>({useQuintzeeAccess:()=>true}));
vi.mock('@/hooks/usePtownWordsAccess',()=>({usePtownWordsAccess:()=>true}));
vi.mock('@/hooks/useChessAccess',()=>({useChessAccess:()=>state.chessAllowed}));
vi.mock('@/hooks/useBattle31Access',()=>({useBattle31Access:()=>true}));
vi.mock('@/hooks/useCanastaAccess',()=>({useCanastaAccess:()=>false}));
// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({pending:new Map<string,{promise:Promise<unknown>;resolve:(value:unknown)=>void}>(),configure:vi.fn(),chessAllowed:true}));
vi.mock('@/hooks/useTriTowersTestAccess',()=>({useTriTowersTestAccess:()=>true}));
vi.mock('@/hooks/useElevenUpAccess',()=>({useElevenUpAccess:()=>true}));
vi.mock('@/hooks/useRoyalFlashAccess',()=>({useRoyalFlashAccess:()=>true}));
vi.mock('@/hooks/useTakeTwoAccess',()=>({useTakeTwoAccess:()=>true}));
vi.mock('@/hooks/useTripFlipAccess',()=>({useTripFlipAccess:()=>true}));
vi.mock('@/hooks/useGolfAccess',()=>({useGolfAccess:()=>true}));
vi.mock('@/hooks/useBoxdropAccess',()=>({useBoxdropAccess:()=>true}));
vi.mock('@/hooks/useRacePokerAccess',()=>({useRacePokerAccess:()=>true}));
vi.mock('@/hooks/useRun21Access',()=>({useRun21Access:()=>false}));
vi.mock('@/lib/canonicalShell/lifecycleDebug',()=>({useLifecycleMount:()=>{}}));
vi.mock('@/lib/canonicalShell/waitingTableFlight',()=>({useWaitingMount:()=>{},recordSurfaceOwnership:()=>{},recordWaitingLifecycle:()=>{}}));
vi.mock('@/lib/debugHarness/activeHarnessWarning',()=>({useActiveHarnessMap:()=>({}),useActiveHarnessInfo:()=>({active:false})}));
vi.mock('@/lib/persistSyncDebugEvent',()=>({persistSyncDebugEvent:()=>{}}));
vi.mock('@/lib/startupFlightRecorder',()=>({recordStartupFlight:()=>{},resetStartupFlight:()=>{}}));
vi.mock('@/lib/dealerGameSetupAuthority',()=>({configureDealerGame:state.configure}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 from:(table:string)=>{let key='';const result=()=>table==='game_defaults'?(state.pending.get(key)?.promise??Promise.resolve({data:{ante_amount:5},error:null})):Promise.resolve({data:{status:'game_selection',config_complete:false,config_deadline:new Date(Date.now()+600000).toISOString()},error:null});const q:any={select:()=>q,eq:(column:string,value:string)=>{if(column==='game_type')key=value;return q;},single:result,maybeSingle:result,then:(yes:any,no:any)=>result().then(yes,no)};return q;},
 channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:()=>{},
 // Keep the real async hook mounted. Unrelated RPCs must not silently succeed.
 rpc:vi.fn(async(name:string)=>{if(name==='mega_competition_catalog')return {data:null,error:null};if(name==='originals_capabilities')return {data:{},error:null};throw new Error('Unexpected RPC: '+name);})
}}));
import {DealerGameSetup} from './DealerGameSetup';
function defer(key:string){let resolve!:(value:unknown)=>void;const promise=new Promise(r=>{resolve=r;});state.pending.set(key,{promise,resolve});return resolve;}
beforeEach(()=>{state.pending.clear();state.chessAllowed=true;state.configure.mockReset();state.configure.mockResolvedValue({dealer_game:{id:'dealer'},game:{status:'ante_decision'},deduped:false});});afterEach(cleanup);
describe('dealer stake defaults cannot overwrite a financial offer',()=>{
 it('Golf Run Back submits the saved stake once through fresh setup',async()=>{
  const previous={game_type:'six-card-golf',run_back_config:{ante_amount:17},ante_amount:17,rollover_amount:0,leg_value:0,legs_to_win:0,pussy_tax_enabled:false,pussy_tax_value:0,pot_max_enabled:false,pot_max_value:0,chucky_cards:0,rabbit_hunt:false,reveal_at_showdown:false};
  render(<DealerGameSetup gameId="session" dealerUsername="Caller" isBot={false} dealerPlayerId="caller" dealerPosition={2} configDeadline={new Date(Date.now()+600000).toISOString()} gameSetupTimerSeconds={600} anteDecisionTimerSeconds={30} activePlayerCount={2} activeHumanCount={2} previousGameType="six-card-golf" previousGameConfig={previous} isFirstHand={false} onConfigComplete={()=>{}} onSessionEnd={()=>{}}/>);
  const button=await screen.findByRole('button',{name:'Run Back Six-Card Golf'});fireEvent.click(button);fireEvent.click(button);
  await waitFor(()=>expect(state.configure).toHaveBeenCalledTimes(1));expect(state.configure).toHaveBeenCalledWith(expect.objectContaining({gameType:'six-card-golf',config:{ante_amount:17,holes:9}}));
 });
 it.each([['six-card-golf','Six-Card Golf'],['race-poker','Race Poker'],['tri-towers','TriTowers'],['eleven-up','11 Up'],['royal-flash','Royal Flash'],['take-two','Take 2'],['trip-flip','Trip Flip'],['boxdrop','Boxdrop']])('%s resolves defaults before admitting edits and ignores late initial defaults',async(game,label)=>{
  const initial=defer('holm'),selected=defer(game);
  render(<DealerGameSetup gameId="session" dealerUsername="Caller" isBot={false} dealerPlayerId="caller" dealerPosition={2} configDeadline={new Date(Date.now()+600000).toISOString()} gameSetupTimerSeconds={600} anteDecisionTimerSeconds={30} activePlayerCount={2} activeHumanCount={2} onConfigComplete={()=>{}} onSessionEnd={()=>{}}/>);
  fireEvent.mouseDown(await screen.findByRole('tab',{name:game==='six-card-golf'?'Cards':'Other'}),{button:0,ctrlKey:false});
  fireEvent.click(document.querySelector(`[data-dealer-game-option="${game}"]`)!);
  expect(screen.queryByLabelText('Match stake ($)')).toBeNull();
  await act(async()=>selected({data:{ante_amount:5},error:null}));
  const input=await screen.findByLabelText('Match stake ($)');expect((input as HTMLInputElement).value).toBe('5');
  fireEvent.change(input,{target:{value:'9'}});
  await act(async()=>initial({data:{ante_amount:59},error:null}));
  expect((input as HTMLInputElement).value).toBe('9');
  fireEvent.click(screen.getByRole('button',{name:'Start '+label}));
  await waitFor(()=>expect(state.configure).toHaveBeenCalledWith(expect.objectContaining({gameType:game,config:{ante_amount:9,...(game==='six-card-golf'?{holes:9}:{})}})));
 });
});

describe('Chess selection and submission share catalog admission',()=>{
 const props={gameId:'session',dealerUsername:'Caller',isBot:false,dealerPlayerId:'caller',dealerPosition:2,gameSetupTimerSeconds:600,anteDecisionTimerSeconds:30,onConfigComplete:()=>{},onSessionEnd:()=>{}};
 async function selectChess(){
  fireEvent.mouseDown(await screen.findByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});
  fireEvent.click(document.querySelector('[data-dealer-game-option="chess"]')!);
  return screen.findByLabelText('Match stake ($)');
 }
 it.each([
  {humans:1,realMoney:false},
  {humans:2,realMoney:false},
  {humans:2,realMoney:true},
 ])('starts two-player Chess once with $humans human(s), real money $realMoney',async({humans,realMoney})=>{
  const deadline=new Date(Date.now()+600000).toISOString();
  render(<DealerGameSetup {...props} configDeadline={deadline} activePlayerCount={2} activeHumanCount={humans} realMoney={realMoney}/>);
  fireEvent.change(await selectChess(),{target:{value:'9'}});
  const start=screen.getByRole('button',{name:'Start chess'});
  fireEvent.click(start);fireEvent.click(start);
  await waitFor(()=>expect(state.configure).toHaveBeenCalledExactlyOnceWith({gameId:'session',dealerPlayerId:'caller',expectedDealerPosition:2,expectedConfigDeadline:deadline,gameType:'chess',config:{ante_amount:9}}));
 });
 it.each([
  {players:1,humans:1,realMoney:false,allowed:true},
  {players:3,humans:1,realMoney:false,allowed:true},
  {players:2,humans:0,realMoney:false,allowed:true},
  {players:2,humans:1,realMoney:true,allowed:true},
  {players:2,humans:1,realMoney:undefined,allowed:true},
  {players:2,humans:1,realMoney:false,allowed:false},
 ])('rechecks changed admission before starting: %j',async({players,humans,realMoney,allowed})=>{
  const deadline=new Date(Date.now()+600000).toISOString();
  const view=render(<DealerGameSetup {...props} configDeadline={deadline} activePlayerCount={2} activeHumanCount={1} realMoney={false}/>);
  await selectChess();
  state.chessAllowed=allowed;
  view.rerender(<DealerGameSetup {...props} configDeadline={deadline} activePlayerCount={players} activeHumanCount={humans} realMoney={realMoney}/>);
  const start=screen.getByRole('button',{name:'Start chess'});
  expect((start as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(start);
  expect(state.configure).not.toHaveBeenCalled();
 });
});
