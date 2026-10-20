export type BoxdropIntent={type:'place';items:[number,number]}|{type:'recycle';items:[number]}|{type:'take_score'|'abandon'};
export interface BoxdropBox {id:number;value:number;color:'red'|'blue'|'green'|'yellow';recycled:boolean}
export interface BoxdropScale {stage:1|2;target:32|21;limit:6|3;sum:number;status:'active'|'closed'|'short'|'broken';boxes:BoxdropBox[]}
export interface BoxdropResult {id?:string;reason:string;score:number;scoreBefore:number;displayScore:number;stageScore:number;firstOrderPoints:number;closurePoints:number;partialPoints:number;speedBonus:number;recyclingBonus:number;bonusEligible:boolean;completedFirstOrders:number;remainingMs:number;completedAt:number}
export interface BoxdropBoard {
 rules:{version:'boxdrop/1';stageMs:number;introMs:number;holdMs:number};
 phase:'intro'|'playing'|'stage_complete'|'complete';scales:BoxdropScale[];current:BoxdropBox;queue:BoxdropBox[];
 recycleIndicator:number;recycleStreak:number;completedFirstOrders:number;closures:number;
 highScore:number;score:number;deadline:number;result?:BoxdropResult|null;
 event:{label:string;points:number;scale?:number;box?:BoxdropBox};
}
export interface BoxdropSnapshot {
 viewerId?:string;terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number;achievements:Record<string,import('../arcade/scoreAchievements').ScoreAchievements>};
 abandoned?:boolean;identity?:{sessionId:string;dealerGameId:string;roundId:string};
 financial?:{balances:Record<string,number>;resultId:string|null;batch:import('../canonicalShell/ChipPresentationLedger').ChipPresentationBatch|null};settlement?:Record<string,number>|null;
 results?:(BoxdropResult&{id:string;playerId:string;stage:number})[];completion?:import('../arcade/model').CompletionRecord|null;
 id:string;revision:number;serverAt:number;scope:string;round:number;board:BoxdropBoard;canAct:boolean;paused:boolean;pausedAt?:number|null;finished:boolean;settled:boolean;solo:boolean;
 players:{id:string;name:string;score:number;active:boolean;seat?:number;chips?:number}[];
}
/** Display clock only. The authoritative reducer owns every deadline transition. */
export function boxdropPlayWindow(board:BoxdropBoard,at:number,releaseIntro=true){
 const released=releaseIntro&&board.phase==='intro'&&at>=board.deadline;
 const deadline=released?board.deadline+board.rules.stageMs:board.deadline;
 return {phase:released?'playing':board.phase,remaining:Math.max(0,Math.min(board.rules.stageMs,deadline-at)),playable:(released||board.phase==='playing')&&at<deadline};
}
export function acceptBoxdropSnapshot(old:BoxdropSnapshot|null,next:BoxdropSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Boxdrop snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:BoxdropSnapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...player})=>player)});
  if(semantic(old)!==semantic(next))throw Error('Boxdrop conflicting snapshot');
 }return next;
}
export function multiplayerSnapshot(v:any):BoxdropSnapshot{
 const id=v.identity.dealerGameId,scope=[id,v.identity.roundId,v.activePlayerId,v.stage].join(':');
 const {rules,phase,scales,current,queue,recycleIndicator,recycleStreak,completedFirstOrders,closures,highScore,score,deadline,event}=v;
 return {identity:v.identity,financial:v.financial,settlement:v.settlement,results:v.stages,viewerId:v.viewerId,terminal:v.terminal,id,revision:v.revision,serverAt:v.serverAt,scope,round:v.stage,
 board:{rules,phase,scales,current,queue,recycleIndicator,recycleStreak,completedFirstOrders,closures,highScore,score,deadline,event,result:phase==='stage_complete'?v.stages.at(-1):null},
 canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,solo:false,
 players:v.players.map((p:any)=>({id:p.id,seat:p.seat,name:p.name,score:v.scores[p.id]??0,active:p.id===v.activePlayerId,chips:v.financial?.balances[p.id]}))};
}
export function arcadeSnapshot(v:any,userId:string):BoxdropSnapshot{return {id:v.id,revision:v.revision,serverAt:v.serverAt,scope:v.view.roundId,round:v.view.round,board:v.view,canAct:v.status==='active',paused:false,finished:v.status!=='active',abandoned:v.status==='abandoned',settled:false,solo:true,completion:v.completion,players:[{id:userId,name:'You',score:v.score,active:true}]};}
