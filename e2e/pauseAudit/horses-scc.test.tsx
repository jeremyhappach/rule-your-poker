import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
const fixture=vi.hoisted(()=>({rpc:vi.fn(),identity:null as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:fixture.rpc,from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),single:async()=>({data:null})};return q;},channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/gameStateSync/authoritativeIdentity',()=>({useAuthoritativeIdentity:()=>({identity:fixture.identity})}));
vi.mock('@/lib/persistSyncDebugEvent',()=>({persistSyncDebugEvent:vi.fn()}));
import {useHorsesMobileController,type HorsesStateFromDB} from '@/hooks/useHorsesMobileController';
const players=['a','b'].map((id,i)=>({id,user_id:`u${i}`,position:i+1,chips:10,is_bot:false,sitting_out:false,profiles:{username:id}}));
const dice=[6,5,3,2,1].map(value=>({value,isHeld:false}));
const playing=():HorsesStateFromDB=>({gamePhase:'playing',currentTurnPlayerId:'b',turnOrder:['a','b'],actionSequence:3,playerStates:{a:{dice,rollsRemaining:1,isComplete:false,rollKey:1},b:{dice,rollsRemaining:1,isComplete:false,rollKey:1}}});
const final=(s:HorsesStateFromDB):HorsesStateFromDB=>({...s,gamePhase:'complete',currentTurnPlayerId:null,actionSequence:4,playerStates:Object.fromEntries(Object.entries(s.playerStates).map(([id,p])=>[id,{...p,rollKey:2,rollsRemaining:0,isComplete:true,result:{rank:0,description:'NQ',isQualified:false,cargoSum:0}}]))});
const success={data:{status:'already_advanced',transition:'tie_rollover'},error:null};
const paused={data:null,error:{message:'game_paused',code:'55000'}};
let resolveFirst:(v:any)=>void;
const calls=()=>fixture.rpc.mock.calls.filter(([name])=>name==='horses_scc_advance_completed_round');
function mount(gameType:string,role:string){
 const start=playing(),end=final(start);
 fixture.identity={dealerGameId:'dealer',roundId:'r1',handNumber:1};
 const h=renderHook(({state,isPaused,round,hand})=>useHorsesMobileController({enabled:true,dealerGameId:'dealer',gameId:'local',players,currentUserId:role==='actor'?'u1':'u0',pot:4,anteAmount:2,dealerPosition:1,currentRoundId:round,currentHandNumber:hand,horsesState:state,gameType,isPaused}),{initialProps:{state:start,isPaused:false,round:'r1',hand:1}});
 const update=(isPaused:boolean,state=end)=>h.rerender({state,isPaused,round:'r1',hand:1});
 return {h,start,end,update};
}
beforeEach(()=>{
 vi.useFakeTimers();fixture.rpc.mockReset();fixture.identity=null;
 fixture.rpc.mockImplementation((name:string)=>({abortSignal:()=>name==='horses_scc_advance_completed_round'&&calls().length===1?new Promise(r=>{resolveFirst=r;}):Promise.resolve(success),then:(r:any)=>Promise.resolve({data:null,error:null}).then(r)}));
 vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
for(const game of ['horses','ship-captain-crew'])it(`${game}: retired completion cannot emit a re-ante presentation`,async()=>{
 const event=vi.fn();window.addEventListener('horses:primary-re-ante',event);
 try{
  const {h,update}=mount(game,'actor');await act(async()=>{});update(false);await act(async()=>{});expect(calls()).toHaveLength(1);
  h.unmount();await act(async()=>resolveFirst({data:{status:'advanced',transition:'tie_rollover',ante_amount:2,active_count:2,pot:4,pre_chips:{a:10,b:10},post_chips:{a:8,b:8},hand_number:2},error:null}));
  await act(()=>vi.advanceTimersByTimeAsync(16000));expect(calls()).toHaveLength(1);expect(event).not.toHaveBeenCalled();
 }finally{window.removeEventListener('horses:primary-re-ante',event);}
});
for(const game of ['horses','ship-captain-crew'])for(const role of ['actor','observer']){
 it(`${game} ${role}: CONTROL rejection before resume wakes exact retry`,async()=>{
  const {update}=mount(game,role);await act(async()=>{});update(false);await act(async()=>{});expect(calls()).toHaveLength(1);
  update(true);await act(async()=>{resolveFirst(paused);});expect(calls()).toHaveLength(1);
  update(false);await act(()=>vi.advanceTimersByTimeAsync(1000));expect(calls()).toHaveLength(2);
  expect(calls()[1][1]).toEqual({p_game_id:'local',p_round_id:'r1',p_dealer_game_id:'dealer',p_hand_number:1});
  await act(()=>vi.advanceTimersByTimeAsync(16000));expect(calls()).toHaveLength(2);
 });
 it(`${game} ${role}: CONTRACT rejection after resume automatically retries`,async()=>{
  const {update}=mount(game,role);await act(async()=>{});update(false);await act(async()=>{});expect(calls()).toHaveLength(1);
  update(true);update(false);await act(async()=>{});expect(calls()).toHaveLength(1);
  await act(async()=>{resolveFirst(paused);});await act(()=>vi.advanceTimersByTimeAsync(16000));
  appendFileSync('e2e/pauseAudit/evidence/phase2-observations.jsonl',JSON.stringify({game,role,scenario:'reject-after-resume',waitMs:16000,calls:calls(),scope:'actual controller; mocked RPC; no SQL or full flow'})+'\n');
  expect(calls()).toHaveLength(2);
 });
 it(`${game} ${role}: CONTROL new authoritative snapshot wakes late-failure retry`,async()=>{
  const {update,end}=mount(game,role);await act(async()=>{});update(false);await act(async()=>{});update(true);update(false);await act(async()=>{resolveFirst(paused);});
  expect(calls()).toHaveLength(1);update(false,{...end});await act(()=>vi.advanceTimersByTimeAsync(1000));expect(calls()).toHaveLength(2);
  expect(calls()[1][1]).toEqual(calls()[0][1]);
 });
}
