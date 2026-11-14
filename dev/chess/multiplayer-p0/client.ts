import {newChess,playChess} from '@/lib/chess/rules';
const s:any={game:{},players:[],listeners:[],writes:[],now:Date.now()};
 s.players=[{id:'p',game_id:'g',user_id:'u',position:4,status:'active',chips:0,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u',username:'Hap'}},{id:'p2',game_id:'g',user_id:'u2',position:7,status:'active',chips:0,is_bot:false,sitting_out:false,waiting:false,ante_decision:'ante_up',profiles:{id:'u2',username:'mcru81'}}];
 s.game={id:'g',name:'Chess route',status:'in_progress',game_type:'chess',current_game_uuid:'d',current_round:1,total_hands:1,dealer_position:4,current_host:'u',created_by:'u',is_paused:false,real_money:true,ante_amount:5,pot:0,pending_session_end:false,config_complete:true,rounds:[{id:'r',game_id:'g',dealer_game_id:'d',round_number:1,hand_number:1,status:'betting',pot:0,created_at:new Date().toISOString()}]};
 s.now=Date.now();const players=s.players.map(p=>({id:p.id,userId:p.user_id,name:p.profiles.username,seat:p.position,isBot:false,chips:0}));
 let state=newChess({identity:{sessionId:'g',dealerGameId:'d',roundId:'r'},players,mode:'live',backgroundId:''},s.now);
 for(const [from,to]of [['f2','f3'],['e7','e5'],['g2','g4']] as const)state=playChess(state,state.players[state.turnIndex].id,{type:'move',from,to},s.now);
 s.chess={...state,id:'d',viewerId:'p',revision:3,serverAt:s.now,canAct:false,paused:false,pausedAt:null,settled:false,finished:false,settlement:null,financial:{balances:{p:0,p2:0},resultId:null,batch:null}};
 localStorage.setItem('ptown:chess:seen:p:d','3');
export const supabase=(()=>{
 const result=(table:string,single:boolean)=>({data:table==='games'?s.game:table==='gameplay_transfer_batches'?(single?s.chess.financial.batch:(s.chess.financial.batch?[s.chess.financial.batch]:[])):table==='game_defaults'?[{game_type:'chess',presentation_mode:'fullscreen'}]:table==='players'?(single?{...s.players[0],intent_version:1,games:{current_game_uuid:s.game.current_game_uuid}}:s.players):table==='profiles'?(single?{id:'u',username:'Hap',is_active:true}:[]):single?null:[],error:null});
 const session=()=>({user:{id:'u'},access_token:'local-fixture',expires_at:Math.floor(Date.now()/1000)+3600});
 return {supabase:{auth:{getSession:async()=>({data:{session:session()},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:(table:string)=>{let single=false;const q:any=new Proxy({}, {get:(_,k)=>k==='then'?(yes:any,no:any)=>Promise.resolve(result(table,single)).then(yes,no):(...args:any[])=>{if(k==='single'||k==='maybeSingle')single=true;if(k==='update')s.writes.push({table,value:args[0]});return q;}});return q;},
 rpc:async(name:string,args:any)=>{if(name==='set_session_player_intent'){s.writes.push({name,args});return {data:{outcome:'accepted',player:{...s.players[0],sit_out_next_hand:true}},error:null};}return {data:name==='read_session_frame'?{game:s.game,players:s.players,allow_bot_dealers:false}:null,error:null};},
 channel:()=>{const ch:any={on:(_:any,filter:any,fn:any)=>{s.listeners.push({filter,fn});return ch;},subscribe:(fn:any)=>{queueMicrotask(()=>fn?.('SUBSCRIBED'));return ch;},unsubscribe(){},send:async()=>{},track:async()=>{},presenceState:()=>({})};return ch;},removeChannel:async()=>{},getChannels:()=>[],functions:{invoke:async()=>({data:null,error:null})}}};
})().supabase;

const scenario=new URLSearchParams(location.search).get('scenario');
if(scenario?.startsWith('bot-forfeit')){
 s.game.real_money=false;s.players[1]={...s.players[1],is_bot:true,profiles:{id:'u2',username:'Bot'}};
 s.chess.players=s.chess.players.map((p:any)=>p.id==='p2'?{...p,name:'Bot',isBot:true,kind:'bot'}:p);
}
s.loads=0;s.commands=[];
window.fetch=async(input:any,init:any)=>{
 if(input==='/api/chess'){
  const request=JSON.parse(init.body);s.loads++;
  if(request.op==='action'){
   // Transport recovery may replay the pending UUID; mirror server receipts.
   if(s.commands.some((c:any)=>c.requestId===request.requestId))return new Response(JSON.stringify({...s.chess,serverAt:Date.now()}),{headers:{'Content-Type':'application/json'}});
   s.commands.push(request);
   if(request.intent.type!=='resign')throw Error('Unexpected fixture action');
   s.now=Date.now();const state=playChess(s.chess,'p',request.intent,s.now);
   await mate(state,{forfeitStartedAt:s.now,startedAt:s.now+5200,deadline:s.now+8200});
   s.players=s.players.map((p:any)=>({...p,chip_transfer_cursor:1}));event('gameplay_transfer_batches',s.chess.financial.batch,{},'INSERT');
   // Model the existing server continuation; the client never owns this timer.
   setTimeout(()=>{s.chess={...s.chess,finished:true,revision:6};publish({status:scenario==='bot-forfeit-end'?'session_ended':'game_selection',game_type:scenario==='bot-forfeit-end'?'chess':null,current_game_uuid:null,current_round:null,total_hands:0,game_over_at:null,last_round_result:null,config_complete:false,dealer_position:4,session_ended_at:scenario==='bot-forfeit-end'?new Date().toISOString():null});},Math.max(0,s.chess.terminal.deadline-Date.now()));
  }
  return new Response(JSON.stringify({...s.chess,serverAt:Date.now()}),{headers:{'Content-Type':'application/json'}});
 }
 return new Response('[]',{headers:{'Content-Type':'application/json'}});
};
function event(table:string,newValue:any,old:any={},eventType='UPDATE'){for(const {filter,fn}of [...s.listeners])if(filter.table===table&&(!filter.event||filter.event==='*'||filter.event===eventType))fn({eventType,new:newValue,old});}
function publish(patch:any){const old=s.game;s.game={...s.game,...patch};event('games',s.game,old);event('chess_revisions',{dealer_game_id:s.chess.id,revision:s.chess.revision});}
export async function mate(forfeitState?:any,timing:Record<string,number>={}){const state=forfeitState??playChess(s.chess,'p2',{type:'move',from:'d8',to:'h4'},s.now);s.chess={...s.chess,...state,revision:5,settled:true,settlement:{p:-5,p2:5},terminal:{resultId:'result',startedAt:s.now+3560,deadline:s.now+6560,...timing,winnerIds:['p2'],score:1},financial:{resultId:'result',balances:{p:-5,p2:5},batch:{id:'batch',game_id:'g',dealer_game_id:'d',cursor:1,reason:'win',transfers:[{id:'transfer',from:{kind:'player',playerId:'p'},to:{kind:'player',playerId:'p2'},amount:5}],opening_balances:{'player:p':0,'player:p2':0},closing_balances:{'player:p':-5,'player:p2':5}}}};s.players=s.players.map(p=>({...p,chips:p.id==='p'?-5:5}));publish({status:'game_over',last_round_result:'P-Town Chess complete',game_over_at:new Date().toISOString()});}
(window as any).p0={state:()=>s,mate:async()=>{s.now=Date.now();await mate();s.players=s.players.map((p:any)=>({...p,chip_transfer_cursor:1}));event('gameplay_transfer_batches',s.chess.financial.batch,{},'INSERT');},continue:()=>{s.chess={...s.chess,finished:true,revision:6};publish({status:'game_selection',game_type:null,current_game_uuid:null,current_round:null,total_hands:0,game_over_at:null,last_round_result:null,config_complete:false,dealer_position:7,config_deadline:new Date(Date.now()+30000).toISOString()});},next:()=>{const state=newChess({identity:{sessionId:'g',dealerGameId:'next',roundId:'r-next'},players:s.chess.players,mode:'live',backgroundId:''},Date.now());s.chess={...state,id:'next',viewerId:'p',revision:0,serverAt:Date.now(),canAct:true,paused:false,settled:false,finished:false,settlement:null,financial:{balances:{p:-5,p2:5},resultId:null,batch:null}};publish({status:'in_progress',game_type:'chess',current_game_uuid:'next',current_round:1,total_hands:1,config_complete:true,rounds:[{id:'r-next',game_id:'g',dealer_game_id:'next',round_number:1,hand_number:1,status:'betting',pot:0,created_at:new Date().toISOString()}]});}};
