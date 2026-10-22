// @vitest-environment jsdom
// Actual route/auth guard with a simulated SDK boundary; no credentials/network.
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const s=vi.hoisted(()=>({game:{} as any,players:[] as any[],listeners:[] as any[],authListeners:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>{
 const result=(table:string,single:boolean)=>({data:table==='games'?s.game:table==='players'?(single?s.players[0]:s.players):table==='profiles'?(single?{id:'u',username:'You',is_active:true}:[]):single?null:[],error:null});
 const session=()=>({user:{id:'u'},expires_at:Math.floor(Date.now()/1000)+3600});
 return {supabase:{
  auth:{getSession:async()=>({data:{session:session()},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null}),onAuthStateChange:(fn:any)=>{s.authListeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};}},
  from:(table:string)=>{let single=false;const q:any=new Proxy({}, {get:(_,k)=>k==='then'?(yes:any,no:any)=>Promise.resolve(result(table,single)).then(yes,no):()=>{if(k==='single'||k==='maybeSingle')single=true;return q;}});return q;},
  rpc:async(name:string)=>({data:name==='read_session_frame'?{game:s.game,players:s.players,allow_bot_dealers:false}:null,error:null}),
  channel:()=>{const ch:any={on:(_:any,filter:any,fn:any)=>{s.listeners.push({filter,fn});return ch;},subscribe:(fn:any)=>{queueMicrotask(()=>fn?.('SUBSCRIBED'));return ch;},unsubscribe(){},send:async()=>{},track:async()=>{},presenceState:()=>({})};return ch;},
  removeChannel:async()=>{},getChannels:()=>[],functions:{invoke:async()=>({data:null,error:null})},
 }};
});
vi.mock('@/components/golf/GolfTable',async()=>{
 const {useEffect}=await import('react');
 const {ShellHudGrid}=await import('@/lib/canonicalShell/ShellHudGrid');
 const {useShellTabBar}=await import('@/lib/canonicalShell/ShellTabBar');
 return {GolfTable:(p:any)=>{useEffect(()=>{if(s.game.status==='session_ended'&&!p.sessionEnded)p.onTerminalActive(true);},[s.game.status,p.sessionEnded]);useShellTabBar({cardsIcon:'spade',activeTab:p.activeTab,setActiveTab:p.setActiveTab,cardsFlashing:null,isPaused:false});return <ShellHudGrid timer={null} identity={<span>You</span>} pane={p.sessionEnded?<div data-testid="golf-retired"/>:<div data-testid="golf-route-child"><button onClick={()=>{p.onTerminalComplete('six-card-golf|winseq|g|d|1|result|r');p.onTerminalActive(false);}}>Complete Golf presentation</button><button onClick={()=>p.onTerminalComplete('six-card-golf|winseq|g|old|1|result|old')}>Stale completion</button></div>}/>;}};
});
import Game from './Game';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();s.listeners=[];s.authListeners=[];
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});
 window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})) as any;
 s.players=[{id:'p',game_id:'g',user_id:'u',position:4,status:'active',chips:100,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u',username:'You'}},{id:'p2',game_id:'g',user_id:'u2',position:3,status:'active',chips:100,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u2',username:'Other'}}];
 s.game={id:'g',name:'Golf route',status:'in_progress',game_type:'six-card-golf',current_game_uuid:'d',current_round:1,total_hands:1,dealer_position:4,current_host:'u',created_by:'u',is_paused:false,real_money:false,ante_amount:5,pot:0,pending_session_end:false,config_complete:true,rounds:[{id:'r',game_id:'g',dealer_game_id:'d',round_number:1,hand_number:1,status:'betting',pot:0,created_at:new Date().toISOString()}]};
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/game/g']}><Routes><Route path="/game/:gameId" element={<Game/>}/><Route path="/" element={<div>Lobby destination</div>}/><Route path="/auth" element={<div>Auth destination</div>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></QueryClientProvider>);}
it('cold ended-session mount verifies authority then routes directly to lobby',async()=>{
 s.game={...s.game,status:'session_ended',session_ended_at:new Date().toISOString()};mount();
 await screen.findByText('Lobby destination',{}, {timeout:10000});expect(screen.queryByTestId('golf-route-child')).toBeNull();
});
it('authenticated live route mounts Golf and confirmed sign-out removes it',async()=>{
 mount();await screen.findByTestId('golf-route-child',{}, {timeout:10000});
 await act(async()=>{for(const fn of s.authListeners)fn('SIGNED_OUT',null);});
 await screen.findByText('Auth destination');expect(screen.queryByTestId('golf-route-child')).toBeNull();
});
it('connected terminal route retains Golf until exact completion, then admits local Session Ended',async()=>{
 mount();await screen.findByTestId('golf-route-child',{}, {timeout:10000});
 const previous=s.game;s.game={...s.game,status:'session_ended',last_round_result:'Golf complete',session_ended_at:new Date().toISOString(),rounds:s.game.rounds.map((r:any)=>({...r,status:'completed'}))};
 await act(async()=>{for(const {filter,fn} of s.listeners)if(filter.table==='games'&&filter.event!=='DELETE'&&filter.event!=='INSERT')fn({eventType:'UPDATE',new:s.game,old:previous});await new Promise(resolve=>setTimeout(resolve,300));});
 expect(screen.queryByText('Lobby destination')).toBeNull();
 expect(screen.getByTestId('golf-route-child')).toBeTruthy();
 fireEvent.click(screen.getByText('Stale completion'));
 expect(screen.getByTestId('golf-route-child')).toBeTruthy();
 fireEvent.click(screen.getByText('Complete Golf presentation'));
 await waitFor(()=>expect(document.querySelector('[data-session-ended-panel]')).toBeTruthy());
 await screen.findByText('Session Ended');
 expect(screen.queryByTestId('golf-route-child')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Back to Lobby'}));
 await screen.findByText('Lobby destination');
});
