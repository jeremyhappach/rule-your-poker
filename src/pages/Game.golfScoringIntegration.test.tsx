// @vitest-environment jsdom
// Actual route/auth guard with a simulated SDK boundary; no credentials/network.
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('canvas-confetti',()=>({default:vi.fn()})); // jsdom has no canvas; keep canonical celebration admission real.
const s=vi.hoisted(()=>({game:{} as any,players:[] as any[],listeners:[] as any[],authListeners:[] as any[],golf:null as any}));
vi.mock('@/integrations/supabase/client',()=>{
 const result=(table:string,single:boolean)=>({data:table==='games'?s.game:table==='players'?(single?s.players[0]:s.players):table==='profiles'?(single?{id:'u',username:'You',is_active:true}:[]):single?null:[],error:null});
 const session=()=>({user:{id:'u'},expires_at:Math.floor(Date.now()/1000)+3600});
 return {supabase:{
  auth:{getSession:async()=>({data:{session:session()},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null}),onAuthStateChange:(fn:any)=>{s.authListeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};}},
  from:(table:string)=>{let single=false;const q:any=new Proxy({}, {get:(_,k)=>k==='then'?(yes:any,no:any)=>Promise.resolve(result(table,single)).then(yes,no):()=>{if(k==='single'||k==='maybeSingle')single=true;return q;}});return q;},
  rpc:async(name:string)=>({data:name==='golf_snapshot'?s.golf:name==='golf_close'?null:name==='read_session_frame'?{game:s.game,players:s.players,allow_bot_dealers:false}:null,error:null}),
  channel:()=>{const ch:any={on:(_:any,filter:any,fn:any)=>{s.listeners.push({filter,fn});return ch;},subscribe:(fn:any)=>{queueMicrotask(()=>fn?.('SUBSCRIBED'));return ch;},unsubscribe(){},send:async()=>{},track:async()=>{},presenceState:()=>({})};return ch;},
  removeChannel:async()=>{},getChannels:()=>[],functions:{invoke:async()=>({data:null,error:null})},
 }};
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

it('actual Game and Golf retain counting and scorecard before winner, then retire on exact terminal completion',async()=>{
 const now=Date.now();
 s.golf={identity:{sessionId:'g',dealerGameId:'d',roundId:'r'},rules:{version:'six-card-golf/1',turnSeconds:30,holes:9,presentation:{version:1,scoringDelayMs:200,resultsDurationMs:1000}},revision:1,serverAt:now,viewerId:'p',stake:5,players:s.players.map(p=>({id:p.id,userId:p.user_id,name:p.profiles.username,seat:p.position,isBot:false,chips:100})),tableaus:{p:{cards:[0,1,2,13,14,15],exposed:Array(6).fill(true)},p2:{cards:[3,4,5,16,17,18],exposed:Array(6).fill(true)}},scores:{p:0,p2:0},holes:[],phase:'playing',hole:9,turnIndex:0,dealerIndex:1,deadline:now+30000,paused:false,canAct:true,pending:null,hasPending:false,stockCount:39,discardTop:20,consecutiveNoRevealTurns:0,finalQueue:['p'],finalReason:'six_exposed',settlement:null,finished:false,financial:{balances:{p:100,p2:100},resultId:null,batch:null}};
 mount();await waitFor(()=>expect(document.querySelector('.golf-local')).toBeTruthy(),{timeout:15000});
 const at=Date.now(),result={...s.golf,revision:3,serverAt:at,phase:'complete',canAct:false,finalQueue:[],settlement:{p:0,p2:0},holes:Array.from({length:9},(_,i)=>({hole:i+1,roundId:i===8?'r':'r'+i,scores:{p:0,p2:0}})),presentation:{version:1,startedAt:at,resultsAt:at+6960,endsAt:at+7960,hidden:{}},terminal:{resultId:'result',winnerIds:['p','p2'],score:0,startedAt:at+7960,deadline:at+10960},financial:{balances:{p:100,p2:100},resultId:'result',batch:null}};
 const publish=async(v:any)=>{s.golf=v;await act(async()=>{for(const {filter,fn}of s.listeners)if(filter.table==='golf_revisions')fn({new:{dealer_game_id:'d',revision:v.revision}});await new Promise(r=>setTimeout(r,40));});};
 await publish(result);
 expect(document.querySelector('.golf-final-scorecard')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Open 9-hole scorecard'}));
 expect(document.querySelector('[role="dialog"] .golf-scorecard tbody tr td:nth-last-child(2)')?.textContent).toBe('');
 expect(document.querySelectorAll('[role="dialog"] .golf-scorecard tbody tr:first-child td svg')).toHaveLength(9); // eight holes + total
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 await waitFor(()=>expect(document.querySelector('[data-golf-score-kind="card"]')).toBeTruthy(),{timeout:4000});
 await publish({...result,revision:1,phase:'playing',presentation:null,terminal:null,settlement:null,serverAt:Date.now()}); // late stale snapshot is ignored
 expect(document.querySelector('[data-golf-score-kind]')).toBeTruthy();
 await publish({...result,serverAt:Date.now()}); // repeated revision must not restart counting
 expect(document.querySelector('.golf-final-scorecard')).toBeNull();
 await waitFor(()=>expect(document.querySelector('[role="dialog"] .golf-scorecard')).toBeTruthy(),{timeout:10000});
 expect(document.querySelectorAll('[role="dialog"] .golf-scorecard tbody tr:first-child td svg')).toHaveLength(10); // nine holes + total
 expect(document.querySelector('.golf-final-scorecard')).toBeNull();
 const previous=s.game;s.game={...s.game,status:'session_ended',last_round_result:'Golf complete',session_ended_at:new Date().toISOString()};
 await act(async()=>{for(const {filter,fn}of s.listeners)if(filter.table==='games'&&filter.event!=='DELETE'&&filter.event!=='INSERT')fn({eventType:'UPDATE',new:s.game,old:previous});});
 expect(screen.queryByText('Lobby destination')).toBeNull();
 // jsdom does not run CSS: deliver each real pencil completion explicitly.
 for(const cell of document.querySelectorAll('[role="dialog"] [data-golf-write]')){
  const event=new Event('webkitAnimationEnd',{bubbles:true});Object.defineProperty(event,'animationName',{value:'golf-write-score'});fireEvent(cell,event);
 }
 await waitFor(()=>expect(document.querySelector('.golf-final-scorecard')).toBeTruthy(),{timeout:4000});
 await publish({...result,revision:4,serverAt:Date.now(),finished:true});
 await waitFor(()=>expect(document.querySelector('[data-session-ended-panel]')).toBeTruthy(),{timeout:6000});
 expect(document.querySelector('.golf-final-scorecard')).toBeNull();
},30000);
