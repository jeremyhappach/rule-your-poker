import {emptyBoard,startBoardClock,presentBoardCard,boardActionError,moveBoardCard,type BoardAction} from '../../src/lib/run21/board.js';
import {scoreBoard} from '../../src/lib/run21/rules.js';
import {assertSharedRules} from '../../src/lib/run21/rulesets.js';
import {shuffleRound} from '../../src/lib/run21/shuffle.server.js';
import type {Board,Config,DeckEvidence} from '../../src/lib/run21/model.js';

export type Game='run21'|'tri-towers'|'quintzee'|'boxdrop';
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;
export interface Attempt {
 actor:string; round:number; score:number; at:number;
 board:Board|Record<string,any>; evidence?:DeckEvidence;
}
export interface State {
 version:'delayed/1'; game:Game; child:string; players:[string,string];
 round:number; turn:number; totals:Record<string,number>; attempts:Attempt[];
 board:Board|Record<string,any>|null; deck:DeckEvidence|null;
 completed:boolean; winner:string|null; segmentStartedAt:number|null;
}
export interface Child {
 id:string; match_id:string; game_type:Game; config:Config|Record<string,any>;
 starter:string; actor:string; segment:number; revision:number; terminal:boolean;
 available_at:string; expires_at:string; state:State|null; server_at:number;
 organizer:string; opponent:string;held?:boolean;
 outcome?:{winner:string|null;reason:string;organizer_delta:number;opponent_delta:number}|null;
}
export type Intent={type:'start'|'tick'|'collect'|'pass'|'draw'|'take_score'}|
 {type:'place';column:number}|{type:'remove';index:number}|{type:'place'|'recycle'|'roll'|'score'|'score_zero';items:number[]};

export function initial(row:Child):State {
 const second=row.starter===row.organizer?row.opponent:row.organizer;
 return {version:'delayed/1',game:row.game_type,child:row.id,players:[row.starter,second],
  round:1,turn:0,totals:{[row.starter]:0,[second]:0},attempts:[],board:null,deck:null,
  completed:false,winner:null,segmentStartedAt:null};
}
export function gameplayDue(s:State):number|null {
 if(!s.board||s.completed)return null;
 return s.board.deadline??null;
}
const actor=(s:State)=>s.players[s.turn];

/** Only scheduling differs from synchronous play. Board rules are shared. */
async function complete(s:State,row:Child,at:number,rpc:Rpc){
 const player=actor(s),board=s.board!;
 const score=s.game==='run21'?(board as Board).result!.score:Number((board as Record<string,any>).score)-s.totals[player];
 if(!Number.isSafeInteger(score))throw Error('delayed:invalid_score');
 s.totals[player]+=score;
 s.attempts.push({actor:player,round:s.round,score,at,board:structuredClone(board),...(s.deck?{evidence:s.deck}:{})});
 s.board=null;s.deck=null;s.segmentStartedAt=null;
 s.turn++;
 if(s.turn===2){s.turn=0;s.round++;}
 if(s.game==='run21'){
  const cfg=row.config as Config;
  if(s.round>cfg.rounds&&s.turn===0&&s.totals[s.players[0]]!==s.totals[s.players[1]])s.completed=true;
 }else if(s.game==='tri-towers'){
  const cfg=row.config as Record<string,any>;
  // Eligibility remains the common SQL rule, including frozen configurations.
  while(s.round>cfg.stages&&!s.completed){
   if(s.round>cfg.stages+cfg.maxBonusStages){s.completed=true;break;}
   const eligible=await rpc('delayed_tri_core',{p_operation:'eligible',p_config:cfg,p_score:s.totals[actor(s)]});
   if(eligible)break;
   s.turn++;if(s.turn===2){s.turn=0;s.round++;}
  }
 }
 if(s.game==='quintzee'||s.game==='boxdrop'){
  const cfg=row.config as Record<string,any>;
  while(s.round>cfg.rounds&&!s.completed){
   if(s.round>cfg.maxRounds){s.completed=true;break;}
   const required=await rpc('delayed_board_core',{p_game:s.game,p_operation:'rounds',p_score:s.totals[actor(s)]});
   if(s.round<=required)break;
   s.turn++;if(s.turn===2){s.turn=0;s.round++;}
  }
 }
 if(s.completed){
  const [a,b]=s.players;s.winner=s.totals[a]===s.totals[b]?null:s.totals[a]>s.totals[b]?a:b;
 }
}

export interface Transition {state:State; advanced:boolean; at:number; forfeit:boolean}
/** Expiry wins at the exact availability boundary. Earlier gameplay deadlines
 * are reduced at their persisted time, including recovery with zero browsers. */
export async function transition(row:Child,intent:Intent,rpc:Rpc):Promise<Transition>{
 const s=structuredClone(row.state??initial(row)),now=Number(row.server_at),expiry=Date.parse(row.expires_at);
 if(s.child!==row.id||s.game!==row.game_type||actor(s)!==row.actor||s.completed)throw Error('delayed:identity');
 if(s.game==='run21')assertSharedRules(row.config as Config);
 const due=gameplayDue(s);
 if(now>=expiry&&(due===null||expiry<=due))return {state:s,advanced:false,at:expiry,forfeit:true};
 let advanced=false,at=now;
 if(due!==null&&now>=due){
  at=due;
  if(s.game==='run21'){
   const b=s.board as Board;b.result=scoreBoard(b,row.config as Config,'timeout',due);
  }else s.board=await sqlBoard(s,'reduce',row.config,due,rpc,{type:'tick'});
  if(s.game==='run21'||(s.board as Record<string,any>).phase==='stage_complete'){await complete(s,row,due,rpc);advanced=true;}
  // An intro boundary may only release the ready phase. Do not apply a command
  // against a state the client has not observed; retry from the new revision.
  return {state:s,advanced,at,forfeit:false};
 }
 if(intent.type==='tick')return {state:s,advanced:false,at,forfeit:false};
 if(intent.type==='start'){
  if(s.board)throw Error('delayed:already_started');
  s.segmentStartedAt=now;
  if(s.game==='run21'){
   const config=row.config as Config;
   s.deck=await shuffleRound({sessionId:row.match_id,dealerGameId:row.id,handNumber:s.round},row.id+':'+row.segment,actor(s));
   const b=emptyBoard(actor(s),config);startBoardClock(b,config,now);presentBoardCard(b,s.deck.cards);s.board=b;
  }else s.board=await sqlBoard(s,'deal',row.config,now,rpc);
  return {state:s,advanced:false,at,forfeit:false};
 }
 if(!s.board)throw Error('delayed:not_started');
 if(s.game==='run21'){
  if(!['place','pass','collect'].includes(intent.type))throw Error('delayed:invalid_action');
  const b=s.board as Board,config=row.config as Config,action=intent as BoardAction;
  const invalid=boardActionError(b,config,action,now);if(invalid)throw Error('delayed:'+invalid);
  let reason: 'collect'|'bust'|'exhausted'|null=null;
  if(action.type==='collect')reason='collect';
  else {reason=moveBoardCard(b,config,action.type==='place'?action:{type:'pass'},now);if(!reason&&!presentBoardCard(b,s.deck!.cards))reason='exhausted';}
  b.revision++;
  if(reason){b.result=scoreBoard(b,config,reason,now);await complete(s,row,now,rpc);advanced=true;}
 }else{
  const allowed=s.game==='tri-towers'?['remove','draw','take_score']:s.game==='boxdrop'?['place','recycle','take_score']:['roll','score','score_zero'];
  if(!allowed.includes(intent.type))throw Error('delayed:invalid_action');
  s.board=await sqlBoard(s,'reduce',row.config,now,rpc,intent);
  if((s.board as Record<string,any>).phase==='stage_complete'){await complete(s,row,now,rpc);advanced=true;}
 }
 return {state:s,advanced,at,forfeit:false};
}

/** Completed own attempts and paired scores are public. No future deck, salt,
 * opponent board or unpaired opponent score crosses this boundary. */
export async function project(row:Child,viewer:string,rpc:Rpc){
 const s=row.state??initial(row),paired=Math.min(...s.players.map(p=>s.attempts.filter(a=>a.actor===p).length));
 const totals=Object.fromEntries(s.players.map(p=>[p,s.attempts.filter(a=>a.actor===p&&(row.terminal||a.round<=paired)).reduce((n,a)=>n+a.score,0)]));
 let board:unknown=null;
 if(viewer===row.actor&&s.board)board=s.game==='run21'?structuredClone(s.board):await sqlBoard(s,'visible',row.config,row.server_at,rpc);
 return {id:row.id,matchId:row.match_id,game:row.game_type,config:row.config,revision:row.revision,segment:row.segment,
  actor:row.actor,round:s.round,board,totals,terminal:row.terminal,held:!!row.held,expiresAt:row.expires_at,serverAt:Number(row.server_at),
  ownResults:await Promise.all(s.attempts.filter(a=>a.actor===viewer).map(async a=>({round:a.round,score:a.score,at:a.at,result:a.board.result,
   board:s.game==='run21'?a.board:await sqlBoard({...s,board:a.board},'visible',row.config,row.server_at,rpc)}))),
  winner:row.terminal?row.outcome?.winner??null:null,
  result:row.terminal&&row.outcome?{reason:row.outcome.reason,winner:row.outcome.winner,
   delta:viewer===row.organizer?row.outcome.organizer_delta:row.outcome.opponent_delta}:null};
}

async function sqlBoard(s:State,operation:string,config:Child['config'],at:number,rpc:Rpc,intent?:Intent){
 if(s.game==='tri-towers')return rpc('delayed_tri_core',{p_operation:operation,p_config:config,p_score:s.totals[actor(s)],p_board:s.board,p_action:intent?.type??null,p_index:intent?.type==='remove'?intent.index:null,p_at:at});
 return rpc('delayed_board_core',{p_game:s.game,p_operation:operation,p_config:config,p_score:s.totals[actor(s)],p_board:s.board,p_action:intent?.type??null,p_items:intent&&'items'in intent?intent.items:null,p_at:at});
}
