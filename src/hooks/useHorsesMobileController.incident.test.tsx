// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({rpc:vi.fn(),identity:null as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:fixture.rpc,from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),single:async()=>({data:null})};return q;},channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/gameStateSync/authoritativeIdentity',()=>({useAuthoritativeIdentity:()=>({identity:fixture.identity})}));
vi.mock('@/lib/persistSyncDebugEvent',()=>({persistSyncDebugEvent:vi.fn()}));
import {useHorsesMobileController,type HorsesStateFromDB} from './useHorsesMobileController';
const players=['a','b'].map((id,i)=>({id,user_id:`u${i}`,position:i+1,chips:10,is_bot:false,sitting_out:false,profiles:{username:id}}));
const dice=[6,5,3,2,1].map(value=>({value,isHeld:false}));
const playing=():HorsesStateFromDB=>({gamePhase:'playing',currentTurnPlayerId:'b',turnOrder:['a','b'],actionSequence:3,playerStates:{a:{dice,rollsRemaining:1,isComplete:false,rollKey:1},b:{dice,rollsRemaining:1,isComplete:false,rollKey:1}}});
const final=(s:HorsesStateFromDB):HorsesStateFromDB=>({...s,gamePhase:'complete',currentTurnPlayerId:null,actionSequence:4,playerStates:Object.fromEntries(Object.entries(s.playerStates).map(([id,p])=>[id,{...p,rollKey:2,rollsRemaining:0,isComplete:true,result:{rank:0,description:'NQ',isQualified:false,cargoSum:0}}]))});
const args=(gameType:string,state:HorsesStateFromDB,round='r1',hand=1)=>{if(fixture.identity?.roundId!==round)fixture.identity={dealerGameId:'dealer',roundId:round,handNumber:hand};return ({enabled:true,dealerGameId:'dealer',gameId:'local',players,currentUserId:'u0',pot:4,anteAmount:2,dealerPosition:1,currentRoundId:round,currentHandNumber:hand,horsesState:state,gameType});};
beforeEach(()=>{vi.useFakeTimers();fixture.identity=null;fixture.rpc.mockReset();fixture.rpc.mockImplementation(()=>({abortSignal:async()=>({data:{status:'already_advanced',transition:'tie_rollover'},error:null}),then:(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve)}));vi.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('keeps own NQ badge hidden after landing until its exact overlay completes',async()=>{
 const start=playing();const end=final(start);
 const h=renderHook(({state})=>useHorsesMobileController(args('ship-captain-crew',state)),{initialProps:{state:start}});
 await act(async()=>{});h.rerender({state:end});await act(async()=>{});
 act(()=>h.result.current.onResultDiceLanded(h.result.current.resultPresentationKey));
 expect(h.result.current.showNoQualifyAnimation).toBe(true);
 expect(h.result.current.getPlayerHandResult('a')).toBeNull();
 act(()=>h.result.current.handleNoQualifyAnimationComplete());
 expect(h.result.current.getPlayerHandResult('a')?.description).toBe('NQ');
});
it.each([true,false])('animates an advancing live opponent roll despite old server time (first=%s)',async first=>{
 const start=playing();start.playerStates.b={...start.playerStates.b,rollKey:first?undefined:1,rollsRemaining:first?3:2,rollStartedAt:new Date(Date.now()-20000).toISOString()};
 const h=renderHook(({state})=>useHorsesMobileController(args('horses',state)),{initialProps:{state:start}});
 await act(async()=>{});expect(!!h.result.current.feltDice?.isRolling).toBe(false);
 const next={...start,actionSequence:4,playerStates:{...start.playerStates,b:{...start.playerStates.b,rollKey:2,rollsRemaining:1}}};
 h.rerender({state:next});await act(async()=>{});
 expect(h.result.current.feltDice?.isRolling).toBe(true);
});
it.each(['horses','ship-captain-crew'])('%s controller retains final actor, resets exact receipts on tie rollover, and skips remount history',async game=>{
 const start=playing(),end=final(start);
 const h=renderHook(({state,round,hand})=>useHorsesMobileController(args(game,state,round,hand)),{initialProps:{state:start,round:'r1',hand:1}});
 await act(async()=>{});h.rerender({state:end,round:'r1',hand:1});await act(async()=>{});
 expect(h.result.current.resultPresentationPending).toBe(true);
 const old=h.result.current;expect(old.turnAnnouncement).toBeNull();
 act(()=>old.onResultDiceLanded(old.resultPresentationKey));expect(h.result.current.turnAnnouncement).toContain('NQ');
 h.rerender({state:start,round:'r2',hand:2});await act(async()=>{});
 expect(h.result.current.currentRoundId).toBe('r2');expect(h.result.current.turnAnnouncement).toBeNull();expect(h.result.current.noQualifyPresentationPending).toBe(false);
 act(()=>old.onResultDiceLanded(old.resultPresentationKey));expect(h.result.current.turnAnnouncement).toBeNull();
 h.unmount();const mounted=renderHook(()=>useHorsesMobileController(args(game,end,'r2',2)));await act(async()=>{});
 expect(mounted.result.current.resultPresentationPending).toBe(false);expect(mounted.result.current.noQualifyPresentationPending).toBe(false);
});
it.each(['horses','ship-captain-crew'])('%s third roll does not restart a full mask after a slow response',async game=>{
 const start={...playing(),currentTurnPlayerId:'a'};const end=final(start);let resolve:any;
 fixture.rpc.mockImplementation((name:string)=>name==='horses_scc_apply_action'?{abortSignal:()=>new Promise(r=>{resolve=r;})}:Promise.resolve({data:null,error:null}));
 const h=renderHook(()=>useHorsesMobileController(args(game,start)));await act(async()=>{});
 expect(h.result.current.isMyTurn).toBe(true);expect(h.result.current.localHand.rollsRemaining).toBe(1);
 let action:Promise<void>;act(()=>{action=h.result.current.handleRoll();});await act(async()=>{});
 expect(h.result.current.isRolling).toBe(true);
 await act(()=>vi.advanceTimersByTimeAsync(2400));
 await act(async()=>{resolve({data:{outcome:'applied',state:end},error:null});await action;});
 await act(()=>vi.advanceTimersByTimeAsync(1));expect(h.result.current.isRolling).toBe(false);
});
