import {aggregate,canFinish,duration,isPerfectBoard,legalColumns,total,scoreBoard} from '../run21/rules.js';
import {shuffleCards} from '../run21/shuffle.server.js';
import {assertConfig,type Board,type Card,type Result} from '../run21/model.js';
import {turnReleaseAt} from '../run21/roundIntro.js';
import {emptyBoard,startBoardClock,presentBoardCard,boardActionError,moveBoardCard} from '../run21/board.js';
import {RUN21_RULESETS,assertSharedRules} from '../run21/rulesets.js';
import type {ArcadeConfig,ArcadeIntent,ArcadeSnapshot,RunRecord,SoloState} from './model.js';
export type Deal = ()=>Card[];
function board(userId:string,config:ArcadeConfig,at:number,deck:Card[]):Board {
 const b=emptyBoard(userId,config);startBoardClock(b,config,at);presentBoardCard(b,deck);return b;
}
export function createSoloRun(row:RunRecord,at:number,deal:Deal=shuffleCards):SoloState {
 const config=structuredClone(row.config);
 assertConfig(config);
 if(RUN21_RULESETS[config.preset])assertSharedRules(config);
 if(config.rounds!==3||duration(config)!==config.roundDurationMs)throw Error('arcade:invalid_ruleset');
 const deck=deal();
 return {runId:row.id,userId:row.user_id,config,round:1,roundId:crypto.randomUUID(),
 board:board(row.user_id,config,at,deck),deck,score:0,results:[],status:'active',updatedAt:at,presentation:null};
}
function finish(s:SoloState,reason:Result['reason'],at:number){
 const result=scoreBoard(s.board,s.config,reason,at),from=s.score;
 s.board.result=result;s.results.push(result);s.score+=result.score;
 const medal=result.score>0?(result.aggregate===105?s.config.goldCelebrationMs:result.aggregate===104?s.config.silverCelebrationMs:0):0;
 s.presentation={startedAt:at+medal,endsAt:at+medal+s.config.scorePresentationMs,from,to:s.score};
 if(s.round===3)s.status='completed';
}
export function nextDue(s:SoloState):number|null {
 if(s.status!=='active')return null;
 return s.presentation?.endsAt??s.board.deadline??s.board.firstPlacementDeadline??null;
}
/** Catch up at persisted boundary times, never at browser reconnect time. No autoplayer. */
export function advanceSolo(input:SoloState,now:number,deal:Deal=shuffleCards):SoloState {
 let s=structuredClone(input);
 for(let guard=0;guard<8&&s.status==='active';guard++){
  const due=nextDue(s);if(due===null||now<due)break;
  if(s.presentation){
   s.round++;s.roundId=crypto.randomUUID();s.deck=deal();s.board=board(s.userId,s.config,due,s.deck);s.presentation=null;
  }else if(s.board.startedAt===null){s.status='expired';s.board.current=null;}
  else finish(s,'timeout',due);
  s.updatedAt=due;
 }
 return s;
}
export function applySolo(input:SoloState,intent:ArcadeIntent,at:number):SoloState {
 if(at<input.updatedAt)throw Error('arcade:clock');
 const s=advanceSolo(input,at);
 if(s.status!=='active')throw Error('arcade:run_ended');
 if(intent.type==='abandon'){s.status='abandoned';s.board.current=null;s.updatedAt=at;return s;}
 if(s.presentation||!s.board.current)throw Error('arcade:result_presentation');
 const release=turnReleaseAt(s.board,s.config);
 if(release!==null&&at<release)throw Error('arcade:round_intro');
 const b=s.board;
 if(intent.type==='collect'||intent.type==='place'||intent.type==='pass'){
  const error=boardActionError(b,s.config,intent.type==='place'?intent:{type:intent.type},at);if(error)throw Error('arcade:'+error);
 }
 if(intent.type==='collect'){finish(s,'collect',at);}
 else if(intent.type==='place'||intent.type==='pass'){
  if(intent.type==='place'){
   s.lastPlacement={sequence:(s.lastPlacement?.sequence??0)+1,column:intent.column,roundId:s.roundId};
  }
  const reason=moveBoardCard(b,s.config,intent.type==='place'?intent:{type:'pass'},at);
  if(reason)finish(s,reason,at);
  else if(!presentBoardCard(b,s.deck))finish(s,'exhausted',at);
 }else throw Error('arcade:invalid_action');
 b.revision++;s.updatedAt=at;return s;
}
/** Explicit allowlist. Decks and future cards never enter browser snapshots. */
export function soloProjection(row:RunRecord,name:string,now:number):ArcadeSnapshot {
 const s=row.state;if(!s)throw Error('arcade:not_initialized');
 const snapshot:ArcadeSnapshot={completion:row.completion??null,id:row.id,game:row.game,ruleset:row.ruleset,revision:row.revision,status:s.status,serverAt:now,score:s.score,dueAt:nextDue(s),events:[],
 view:{presentationKey:s.runId,config:s.config,roundId:s.roundId,roundNumber:s.round,players:[{id:s.userId,name}],
 viewerId:s.userId,boards:{[s.userId]:structuredClone(s.board)},active_player_id:s.presentation||s.status!=='active'?null:s.userId,
 liveBoards:true,revealed:false,cumulative:{[s.userId]:s.score},
 scorePresentation:s.presentation?{playerId:s.userId,...s.presentation}:null}};
 if(s.lastPlacement?.roundId===s.roundId)snapshot.events=[{sequence:s.lastPlacement.sequence,type:'card_placed',actorId:s.userId,operands:{column:s.lastPlacement.column},frame:{config:snapshot.view.config,boards:snapshot.view.boards}}];
 return snapshot;
}

