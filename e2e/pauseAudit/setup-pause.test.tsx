vi.mock('@/hooks/useQuintzeeAccess',()=>({useQuintzeeAccess:()=>true}));
vi.mock('@/hooks/usePtownWordsAccess',()=>({usePtownWordsAccess:()=>true}));
vi.mock('@/hooks/useBattle31Access',()=>({useBattle31Access:()=>true}));
vi.mock('@/hooks/useCanastaAccess',()=>({useCanastaAccess:()=>false}));
// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({pending:new Map<string,{promise:Promise<unknown>;resolve:(value:unknown)=>void}>(),configure:vi.fn()}));
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
 channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:()=>{},rpc:vi.fn(async()=>({data:{outcome:'paused'},error:null}))
}}));
import {DealerGameSetup} from '@/components/DealerGameSetup';

const props={gameId:'session',dealerUsername:'Host',isBot:false,dealerPlayerId:'caller',dealerPosition:1,configDeadline:new Date(31000).toISOString(),gameSetupTimerSeconds:30,anteDecisionTimerSeconds:30,activePlayerCount:2,activeHumanCount:2,onConfigComplete:()=>{},onSessionEnd:()=>{}};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1000);state.pending.clear();state.configure.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('host can pause and resume inside the blocking setup surface',async()=>{
 const toggle=vi.fn(),ui=render(<DealerGameSetup {...props} onTogglePause={toggle}/>);await act(()=>vi.advanceTimersByTimeAsync(60));
 const pause=screen.getByRole('button',{name:'Pause game'});expect(pause.closest('[data-dealer-game-setup-step]')).not.toBeNull();fireEvent.click(pause);expect(toggle).toHaveBeenCalledTimes(1);
 ui.rerender(<DealerGameSetup {...props} isPaused onTogglePause={toggle}/>);fireEvent.click(screen.getByRole('button',{name:'Resume game'}));expect(toggle).toHaveBeenCalledTimes(2);
});
it('non-host dealer has no pause authority control',async()=>{render(<DealerGameSetup {...props}/>);await act(()=>vi.advanceTimersByTimeAsync(60));expect(screen.queryByRole('button',{name:/Pause game|Resume game/})).toBeNull();});
it('paused setup does not fire its countdown or timeout even after the old deadline',async()=>{
 const {supabase}=await import('@/integrations/supabase/client');vi.mocked(supabase.rpc).mockClear();
 const ui=render(<DealerGameSetup {...props} isPaused onTogglePause={()=>{}}/>);await act(()=>vi.advanceTimersByTimeAsync(60));
 await act(()=>vi.advanceTimersByTimeAsync(650000));
 expect(supabase.rpc).not.toHaveBeenCalled();expect(screen.getByText('Paused')).toBeTruthy();
 ui.rerender(<DealerGameSetup {...props} configDeadline={new Date(Date.now()+30000).toISOString()} onTogglePause={()=>{}}/>);await act(()=>vi.advanceTimersByTimeAsync(60));
 expect(screen.queryByText('Paused')).toBeNull();expect(supabase.rpc).not.toHaveBeenCalled();
});

it('live pause freezes the visible setup countdown and resume uses the new deadline',async()=>{
 const ui=render(<DealerGameSetup {...props}/>);await act(()=>vi.advanceTimersByTimeAsync(60));
 const before=screen.getByText('600s').textContent;
 ui.rerender(<DealerGameSetup {...props} isPaused/>);await act(()=>vi.advanceTimersByTimeAsync(9000));
 expect(screen.getByText(before!)).toBeTruthy();
 ui.rerender(<DealerGameSetup {...props} configDeadline={new Date(Date.now()+20000).toISOString()}/>);
 await act(()=>vi.advanceTimersByTimeAsync(1000));expect(screen.getByText('19s')).toBeTruthy();
});
