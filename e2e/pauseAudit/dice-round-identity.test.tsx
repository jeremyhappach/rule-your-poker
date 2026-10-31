// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({rpc:vi.fn(),identity:null as any}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:fixture.rpc,from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),single:async()=>({data:null})};return q;},channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/gameStateSync/authoritativeIdentity',()=>({useAuthoritativeIdentity:()=>({identity:fixture.identity})}));
vi.mock('@/lib/persistSyncDebugEvent',()=>({persistSyncDebugEvent:vi.fn()}));
import {useHorsesMobileController,type HorsesStateFromDB} from '@/hooks/useHorsesMobileController';
const players=['a','b'].map((id,i)=>({id,user_id:`u${i}`,position:i+1,chips:10,is_bot:false,sitting_out:false,profiles:{username:id}}));
const dice=[6,5,3,2,1].map(value=>({value,isHeld:false}));
const playing=():HorsesStateFromDB=>({gamePhase:'playing',currentTurnPlayerId:'b',turnOrder:['a','b'],actionSequence:3,playerStates:{a:{dice,rollsRemaining:1,isComplete:false,rollKey:1},b:{dice,rollsRemaining:1,isComplete:false,rollKey:1}}});
const final=(s:HorsesStateFromDB):HorsesStateFromDB=>({...s,gamePhase:'complete',currentTurnPlayerId:null,actionSequence:4,playerStates:Object.fromEntries(Object.entries(s.playerStates).map(([id,p])=>[id,{...p,rollKey:2,rollsRemaining:0,isComplete:true,result:{rank:0,description:'NQ',isQualified:false,cargoSum:0}}]))});
const args=(gameType:string,state:HorsesStateFromDB,round='r1',hand=1)=>{if(fixture.identity?.roundId!==round)fixture.identity={dealerGameId:'dealer',roundId:round,handNumber:hand};return ({enabled:true,dealerGameId:'dealer',gameId:'local',players,currentUserId:'u0',pot:4,anteAmount:2,dealerPosition:1,currentRoundId:round,currentHandNumber:hand,horsesState:state,gameType});};
beforeEach(()=>{vi.useFakeTimers();fixture.identity=null;fixture.rpc.mockReset();fixture.rpc.mockImplementation(()=>({abortSignal:async()=>({data:{status:'already_advanced',transition:'tie_rollover'},error:null}),then:(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve)}));vi.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('never pairs an old completed result with a forward round during any render',async()=>{
 const start=playing(),end=final(start),renders:any[]=[];
 const h=renderHook(({state,round,hand})=>{const props=args('ship-captain-crew',state,round,hand);fixture.identity={dealerGameId:'dealer',roundId:'r1',handNumber:1};const value=useHorsesMobileController(props);renders.push({round:value.presentationRoundId,ready:!!value.getPlayerHandResult('b')});return value;},{initialProps:{state:start,round:'r1',hand:1}});
 await act(async()=>{});h.rerender({state:end,round:'r1',hand:1});await act(async()=>{});
 act(()=>h.result.current.onResultDiceLanded(h.result.current.resultPresentationKey));
 const from=renders.length;h.rerender({state:start,round:'r2',hand:2});await act(async()=>{});
 expect(renders.slice(from).some(r=>r.round==='r2'&&r.ready)).toBe(false);
 expect(h.result.current.presentationRoundId).toBe('r2');
});
