// @vitest-environment jsdom
// Real route, shell, board, chip ledger and menu; network, server clock and audio are fixtures.
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {newChess,playChess} from '@/lib/chess/rules';
const s=vi.hoisted(()=>({game:{} as any,user:'u',players:[] as any[],listeners:[] as any[],chess:null as any,notify:()=>{},renders:0,now:0,cursor:'settled',writes:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>{
 const result=(table:string,single:boolean)=>({data:table==='games'?s.game:table==='gameplay_transfer_batches'?(single?s.chess?.financial.batch:(s.chess?.financial.batch?[s.chess.financial.batch]:[])):table==='game_defaults'?[{game_type:'chess',presentation_mode:'fullscreen'}]:table==='players'?(single?{...s.players.find(p=>p.user_id===s.user),intent_version:1,games:{current_game_uuid:s.game.current_game_uuid}}:s.players):table==='profiles'?(single?{id:'u',username:'Hap',is_active:true}:[]):single?null:[],error:null});
 const session=()=>({user:{id:s.user},expires_at:Math.floor(Date.now()/1000)+3600});
 return {supabase:{auth:{getSession:async()=>({data:{session:session()},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:(table:string)=>{let single=false;const q:any=new Proxy({}, {get:(_,k)=>k==='then'?(yes:any,no:any)=>Promise.resolve(result(table,single)).then(yes,no):(...args:any[])=>{if(k==='single'||k==='maybeSingle')single=true;if(k==='update')s.writes.push({table,value:args[0]});return q;}});return q;},
 rpc:async(name:string,args:any)=>{if(name==='set_session_player_intent'){s.writes.push({name,args});return {data:{outcome:'accepted',player:{...s.players[0],sit_out_next_hand:true}},error:null};}return {data:name==='read_session_frame'?{game:s.game,players:s.players,allow_bot_dealers:false}:null,error:null};},
 channel:()=>{const ch:any={on:(_:any,filter:any,fn:any)=>{s.listeners.push({filter,fn});return ch;},subscribe:(fn:any)=>{queueMicrotask(()=>fn?.('SUBSCRIBED'));return ch;},unsubscribe(){},send:async()=>{},track:async()=>{},presenceState:()=>({})};return ch;},removeChannel:async()=>{},getChannels:()=>[],functions:{invoke:async()=>({data:null,error:null})}}};
});
vi.mock('@/hooks/useChess',async()=>{const {useReducer,useEffect}=await import('react');return {useChess:(id:string)=>{if(++s.renders>500)throw Error("excess Chess renders");const [,update]=useReducer(n=>n+1,0);useEffect(()=>{s.notify=update;return()=>{s.notify=()=>{};};},[]);return {snapshot:s.chess?.id===id?s.chess:null,now:s.now,connected:true,pending:false,error:'',act:async()=>true,reconnect:async()=>true};}};});
vi.mock('@/lib/chess/statusSound',()=>({preloadChessStatusSound:vi.fn(),chessStatusSound:vi.fn(()=>vi.fn()),chessHeartbeat:vi.fn(()=>vi.fn())}));
vi.mock('@/lib/chess/sound',()=>({chessSound:vi.fn(()=>vi.fn())}));
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
import {chessStatusSound} from '@/lib/chess/statusSound';
import Game from './Game';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();s.listeners=[];s.writes=[];s.user='u';s.cursor='settled';s.renders=0;vi.clearAllMocks();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});
 window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})) as any;
 s.players=[{id:'p',game_id:'g',user_id:'u',position:4,status:'active',chips:0,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u',username:'Hap'}},{id:'p2',game_id:'g',user_id:'u2',position:7,status:'active',chips:0,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u2',username:'mcru81'}}];
 s.game={id:'g',name:'Chess route',status:'in_progress',game_type:'chess',current_game_uuid:'d',current_round:1,total_hands:1,dealer_position:4,current_host:'u',created_by:'u',is_paused:false,real_money:true,ante_amount:5,pot:0,pending_session_end:false,config_complete:true,rounds:[{id:'r',game_id:'g',dealer_game_id:'d',round_number:1,hand_number:1,status:'betting',pot:0,created_at:new Date().toISOString()}]};
 s.now=Date.now();const players=s.players.map(p=>({id:p.id,userId:p.user_id,name:p.profiles.username,seat:p.position,isBot:false,chips:0}));
 let state=newChess({identity:{sessionId:'g',dealerGameId:'d',roundId:'r'},players,mode:'live',backgroundId:''},s.now);
 for(const [from,to]of [['f2','f3'],['e7','e5'],['g2','g4']] as const)state=playChess(state,state.players[state.turnIndex].id,{type:'move',from,to},s.now);
 s.chess={...state,id:'d',viewerId:'p',revision:3,serverAt:s.now,canAct:false,paused:false,pausedAt:null,settled:false,finished:false,settlement:null,financial:{balances:{p:0,p2:0},resultId:null,batch:null}};
 localStorage.setItem('ptown:chess:seen:p:d','3');localStorage.setItem('ptown:chess:seen:p2:d','3');
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/game/g']}><Routes><Route path="/game/:gameId" element={<Game/>}/><Route path="/" element={<div>Lobby destination</div>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></QueryClientProvider>);}
async function publish(patch:Record<string,unknown>){const previous=s.game;s.game={...s.game,...patch};await act(async()=>{for(const {filter,fn}of [...s.listeners])if(filter.table==='games'&&filter.event!=='DELETE'&&filter.event!=='INSERT')fn({eventType:'UPDATE',new:s.game,old:previous});s.notify();await new Promise(resolve=>setTimeout(resolve,50));});}
async function mate(){const state=playChess(s.chess,'p2',{type:'move',from:'d8',to:'h4'},s.now);s.chess={...s.chess,...state,revision:5,settled:true,settlement:{p:-5,p2:5},terminal:{resultId:'result',startedAt:s.now+3560,deadline:s.now+6560,winnerIds:['p2'],score:1},financial:{resultId:'result',balances:{p:-5,p2:5},batch:{id:'batch',game_id:'g',dealer_game_id:'d',cursor:1,reason:'win',transfers:[{id:'transfer',from:{kind:'player',playerId:'p'},to:{kind:'player',playerId:'p2'},amount:5}],opening_balances:{'player:p':0,'player:p2':0},closing_balances:{'player:p':-5,'player:p2':5}}}};s.players=s.players.map(p=>({...p,chips:p.id==='p'?-5:5}));await publish({status:'game_over',last_round_result:'P-Town Chess complete',game_over_at:new Date().toISOString()});}
it('keeps the canonical header and usable sit-out menu during multiplayer Chess',async()=>{
 mount();await screen.findByRole('group',{name:'Chess board'},{timeout:15000});
 const menu=screen.getByRole('button',{name:'Player options'});expect(menu.closest('[data-canonical-shell-header]')).toBeTruthy();
 fireEvent.keyDown(menu,{key:'Enter'});const sitOut=await screen.findByRole('menuitemcheckbox',{name:'Sit Out Next Hand'});expect(sitOut.getAttribute('aria-disabled')).not.toBe('true');fireEvent.click(sitOut);
 await waitFor(()=>expect(s.writes.some(w=>w.name==='set_session_player_intent'&&w.args.p_option==='sit_out_next_hand'&&w.args.p_value===true)).toBe(true));
});
it.each([['u','p','loss','−$5'],['u2','p2','win','+$5']] as const)('retains one board, approved mate cue and exact signed settlement for %s',async(user,viewer,cue,net)=>{
 s.user=user;s.chess={...s.chess,viewerId:viewer};
 mount();const board=await screen.findByRole('group',{name:'Chess board'},{timeout:15000});await mate();
 expect(document.querySelectorAll('[data-fullscreen-game-shell]')).toHaveLength(1);
 expect(document.querySelector('[data-slot-mode="persistent-children"]')).toBeTruthy();
 expect(screen.getByRole('group',{name:'Chess board'})).toBe(board);
 expect(document.querySelector('[data-instance-label="status-keyed"]')).toBeNull();
 const moving=document.querySelector('.chess-slide');expect(moving).toBeTruthy();act(()=>moving!.dispatchEvent(new Event('webkitAnimationEnd',{bubbles:true})));
 expect(await screen.findByText('Checkmate')).toBeTruthy();expect(vi.mocked(chessStatusSound).mock.calls.map(c=>c[1])).toEqual([cue]);
 s.now=s.chess.terminal.startedAt;await act(async()=>s.notify());
 expect(await screen.findByText(`Checkmate · mcru81 wins · You ${net}`)).toBeTruthy();
});
it.each(['game_selection','configuring','in_progress'])('drains the old presentation once when the opponent reaches %s, then removes the old board',async status=>{
 mount();await screen.findByRole('group',{name:'Chess board'},{timeout:15000});await mate();
 const terminal=s.chess.terminal;await publish({status,last_round_result:null,game_over_at:null,game_type:status==='game_selection'?null:'chess',current_game_uuid:status==='game_selection'?null:'next',config_complete:status==='in_progress',dealer_position:7,config_deadline:new Date(Date.now()+30000).toISOString(),rounds:status==='in_progress'?[{...s.game.rounds[0],id:'next-round',dealer_game_id:'next'}]:s.game.rounds});
 expect(screen.getByRole('group',{name:'Chess board'})).toBeTruthy();
 s.now=terminal.deadline+1;s.chess={...s.chess,finished:true,revision:6};await act(async()=>s.notify());
 // The fixture keeps serving the old snapshot: a retired owner must never be mounted as successor.
 await waitFor(()=>expect(document.querySelector('.chess-board')).toBeNull(),{timeout:3000});
 expect(screen.queryByText('P-Town Chess complete')).toBeNull();expect(screen.getByRole('button',{name:'Player options'})).toBeTruthy();
});
it('exposes inconsistent financial evidence and holds completion until a consistent snapshot arrives',async()=>{
 mount();await screen.findByRole('group',{name:'Chess board'},{timeout:15000});await mate();
 s.chess={...s.chess,finished:true,financial:{...s.chess.financial,balances:{p:-5,p2:4}}};s.now=s.chess.terminal.deadline+1;
 await publish({status:'game_selection',game_type:null,current_game_uuid:null,last_round_result:null,game_over_at:null,config_complete:false,dealer_position:7});
 expect(screen.getByText('Settlement unavailable — reconnect')).toBeTruthy();expect(screen.getByRole('button',{name:'Settlement unavailable — reconnect'})).toBeTruthy();
 expect(screen.getByRole('group',{name:'Chess board'})).toBeTruthy();
 s.chess={...s.chess,financial:{...s.chess.financial,balances:{p:-5,p2:5}}};await act(async()=>s.notify());
 await waitFor(()=>expect(document.querySelector('.chess-board')).toBeNull());
});

it.each(['game_selection','session_ended'])('retires a bot forfeit into %s without a generic result or reconnecting board',async status=>{
 s.game={...s.game,real_money:false};s.players[1]={...s.players[1],is_bot:true,profiles:{id:'u2',username:'Bot'}};
 s.chess={...s.chess,players:s.chess.players.map((p:any)=>p.id==='p2'?{...p,name:'Bot',isBot:true,kind:'bot'}:p)};
 mount();const board=await screen.findByRole('group',{name:'Chess board'},{timeout:15000});
 // Same committed payout as mate, with the installed forfeit presentation window.
 await mate();s.chess={...s.chess,reason:'resignation',terminal:{...s.chess.terminal,forfeitStartedAt:s.now,startedAt:s.now+5200,deadline:s.now+8200}};
 await act(async()=>s.notify());
 expect(screen.getByRole('group',{name:'Chess board'})).toBe(board);
 expect(document.querySelector('[data-instance-label="status-keyed"]')).toBeNull();
 s.now=s.chess.terminal.startedAt;await act(async()=>s.notify());
 expect(screen.getByText('Hap forfeited · Bot wins · You −$5')).toBeTruthy();
 // A session/identity update can arrive before the Chess finished revision.
 await publish({status,game_type:status==='session_ended'?'chess':null,current_game_uuid:null,current_round:null,config_complete:false,last_round_result:null,game_over_at:null,session_ended_at:status==='session_ended'?new Date().toISOString():null});
 expect(screen.getByRole('group',{name:'Chess board'})).toBe(board);
 s.now=s.chess.terminal.deadline+1;s.chess={...s.chess,finished:true,revision:6};await act(async()=>s.notify());
 await waitFor(()=>expect(document.querySelector('.chess-board')).toBeNull(),{timeout:3000});
 expect(screen.queryByText('P-Town Chess complete')).toBeNull();expect(screen.queryByText(/reconnecting/i)).toBeNull();
 if(status==='session_ended'){
  const back=await screen.findByRole('button',{name:'Back to Lobby'});fireEvent.click(back);
  expect(await screen.findByText('Lobby destination')).toBeTruthy();
 }
});
