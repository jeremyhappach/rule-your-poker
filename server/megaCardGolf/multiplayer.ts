import {isUuid} from '../../src/lib/run21/model.js';
import {startPlayerHole,playPlayerHole,completedHole,projectPlayerHole,type MegaCompetitionConfig} from '../../src/lib/megaCardGolf/competition.js';
import {megaDecks} from '../../src/lib/megaCardGolf/shuffle.server.js';
import {savedHolePresentation} from '../../src/lib/megaCardGolf/presentation.js';
import type {MegaRun,Intent,HoleResult} from '../../src/lib/megaCardGolf/engine.js';

export interface MegaPlayer {id:string;userId:string;name:string;seat:number;isBot:boolean;chips:number}
export interface MegaLiveState {
 identity:{sessionId:string;dealerGameId:string;roundId:string};
 rules:MegaCompetitionConfig&{holes:number};players:MegaPlayer[];
 phase:'ready'|'playing'|'hole_complete'|'complete';turnIndex:number;hole:number;deadline:number;
 board:MegaRun|null;runs:Record<string,MegaRun>;scores:Record<string,number>;
 results:(HoleResult&{actor:string})[];holes:{hole:number;scores:Record<string,number>}[];
 presentation?:{startedAt:number;endsAt:number};
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number};
}
export interface MegaLiveRow {dealer_game_id:string;game_id:string;round_id:string;state:MegaLiveState;revision:number;server_at:number;paused_at:number|null;settlement:Record<string,number>|null;finished:boolean;viewer:string|null;financial:any;receipt?:{actor:string;fingerprint:string}|null}
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;

/** Participant sequencing only. Every card action and score uses Arcade's engine. */
export function liveTransition(row:MegaLiveRow,intent:Intent|{type:'tick'}):MegaLiveState {
 const s=structuredClone(row.state),now=Number(row.server_at);
 if(row.paused_at!==null||row.settlement||row.finished)return s;
 if(s.phase==='complete')return s;
 const due=now>=s.deadline;
 if(s.phase==='ready'||s.phase==='hole_complete'){
  if(!due||intent.type!=='tick')throw Error('mega:transition_pending');
  if(s.phase==='hole_complete'){
   s.turnIndex++;if(s.turnIndex===s.players.length){s.turnIndex=0;s.hole++;}
  }
  const actor=s.players[s.turnIndex].id,prior=s.runs[actor]??null;
  s.board=startPlayerHole(row.dealer_game_id+':'+actor,actor,s.rules,prior,prior?null:megaDecks(s.rules.course.holes),s.deadline);
  s.phase='playing';s.deadline=s.board.deadline;return s;
 }
 if(!s.board)throw Error('mega:missing_board');
 if(intent.type!=='tick'&&due)throw Error('mega:deadline');
 s.board=playPlayerHole(s.board,intent,now);s.deadline=s.board.deadline;
 const result=completedHole(s.board);
 if(result){
  const actor=s.players[s.turnIndex].id;s.runs[actor]=structuredClone(s.board);s.scores[actor]=s.board.score;
  s.results.push({...result,actor});s.phase='hole_complete';
  s.presentation={startedAt:result.startedAt,endsAt:savedHolePresentation(projectPlayerHole(s.board,now),result.startedAt).events[0].end};
  s.deadline=s.presentation.endsAt;
  if(s.turnIndex===s.players.length-1){
   s.holes.push({hole:s.hole,scores:Object.fromEntries(s.results.filter(r=>r.hole===s.hole).map(r=>[r.actor,r.score]))});
   if(s.hole===s.rules.course.holes)s.phase='complete';
  }
 }
 return s;
}
export function projectLive(row:MegaLiveRow){
 const s=row.state;
 return {id:row.dealer_game_id,identity:s.identity,revision:Number(row.revision),serverAt:Number(row.server_at),scope:row.round_id+':'+s.hole+':'+s.turnIndex,
  board:s.board?projectPlayerHole(s.board,Number(row.server_at)):null,rules:s.rules,players:s.players.map(p=>({...p,chips:row.financial?.balances?.[p.id]??p.chips})),actor:s.players[s.turnIndex]?.id,viewerId:row.viewer,
  hole:s.hole,phase:s.phase,deadline:s.deadline,results:s.results.map(r=>({actor:r.actor,hole:r.hole,score:r.score,at:r.startedAt})),
  scores:s.scores,canAct:row.viewer===s.players[s.turnIndex]?.id&&row.paused_at===null&&!row.settlement&&s.phase==='playing',
  paused:row.paused_at!==null,pausedAt:row.paused_at,settled:row.settlement!==null,settlement:row.settlement,finished:row.finished,terminal:s.terminal,financial:row.financial};
}
export async function synchronizeMegaMatch(rpc:Rpc,input:MegaLiveRow,actor:string|null,token:string|null=null){
 let row=input;
 for(let guard=0;guard<8;guard++){
  if(row.finished||row.paused_at!==null)return row;
  if(row.settlement){
   if(Number(row.server_at)>=Math.max(row.state.terminal?.deadline??0,row.state.presentation?.endsAt??0))return rpc('mega_live_finish',{p_match:row.dealer_game_id,p_actor:actor,p_token:token});
   return row;
  }
  if(Number(row.server_at)<row.state.deadline)return row;
  const next=liveTransition(row,{type:'tick'});
  const result=await rpc('mega_live_commit',{p_match:row.dealer_game_id,p_actor:actor,p_revision:row.revision,p_state:next,p_token:token});
  row=result.record;
 }
 return row;
}
export async function megaLiveOperation(rpc:Rpc,actor:string,body:Record<string,any>){
 if(!['state','action'].includes(body.op)||!isUuid(body.matchId))throw Error('mega:invalid_request');
 if(body.op==='action'&&(!isUuid(body.requestId)||!Number.isSafeInteger(body.revision)||typeof body.scope!=='string'))throw Error('mega:invalid_request');
 let row:MegaLiveRow=await rpc('mega_live_load',{p_match:body.matchId,p_actor:actor,p_request:body.op==='action'?body.requestId:null});
 const intent=body.intent as Intent;
 if(body.op==='action'&&(!intent||!['open','draw','replace','discard','stand-pat'].includes(intent.type)))throw Error('mega:invalid_action');
 const fingerprint=JSON.stringify({matchId:body.matchId,revision:body.revision,scope:body.scope,intent});
 if(row.receipt){if(row.receipt.actor!==actor||row.receipt.fingerprint!==fingerprint)throw Error('mega:request_conflict');return projectLive(row);}
 row=await synchronizeMegaMatch(rpc,row,actor);
 if(body.op==='action'){
  if(!projectLive(row).canAct||Number(row.revision)!==body.revision||projectLive(row).scope!==body.scope)throw Error('mega:stale_action');
  const next=liveTransition(row,intent);
  const result=await rpc('mega_live_commit',{p_match:row.dealer_game_id,p_actor:actor,p_revision:row.revision,p_state:next,p_request:body.requestId,p_fingerprint:fingerprint});
  if(!['committed','duplicate'].includes(result.outcome))throw Error('mega:stale_action');row=result.record;
 }
 return projectLive(row);
}
