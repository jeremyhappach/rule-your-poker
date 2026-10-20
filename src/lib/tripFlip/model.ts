export type TripFlipIntent={type:'move';items:[number,number,number]}|{type:'take_score'|'abandon'};
export interface TripFlipResult {id?:string;reason:string;score:number;scoreBefore:number;displayScore:number;stageScore:number;tripPoints:number;runPoints:number;suitedBonus:number;specialBonus:number;timeDots:number;timeBonus:number;completedAt:number}
export interface TripFlipBoard {
 rules:{version:'trip-flip/1';stageMs:number;introMs:number;holdMs:number;dots:number;dotMs:number;timePerDot:number};
 phase:'intro'|'playing'|'stage_complete'|'complete';columns:number[][];cells:(number|null)[];fan:number[];
 special:number[];specialClaimed:boolean;legalMoves:[number,number,number][];
 highScore:number;stockRemaining:number;trips:number;runs:number;suitedTotal:number;specialTotal:number;score:number;deadline:number;
 result?:TripFlipResult|null;event:{label:string;points:number;destination?:number;source?:number;card?:number;special?:boolean};
}
export interface TripFlipSnapshot {
 viewerId?:string;terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number;achievements:Record<string,import('../arcade/scoreAchievements').ScoreAchievements>};
 abandoned?:boolean;identity?:{sessionId:string;dealerGameId:string;roundId:string};
 financial?:{balances:Record<string,number>;resultId:string|null;batch:import('../canonicalShell/ChipPresentationLedger').ChipPresentationBatch|null};settlement?:Record<string,number>|null;
 results?:(TripFlipResult&{id:string;playerId:string;stage:number})[];completion?:import('../arcade/model').CompletionRecord|null;
 id:string;revision:number;serverAt:number;scope:string;round:number;board:TripFlipBoard;canAct:boolean;paused:boolean;pausedAt?:number|null;finished:boolean;settled:boolean;solo:boolean;
 players:{id:string;name:string;score:number;active:boolean;seat?:number;chips?:number}[];
}
/** Presentation only; the server owns transitions and the actual banking award. */
export function tripFlipPlayWindow(board:TripFlipBoard,at:number,releaseIntro=true){
 const released=releaseIntro&&board.phase==='intro'&&at>=board.deadline;
 const deadline=released?board.deadline+board.rules.stageMs:board.deadline;
 return {phase:released?'playing':board.phase,remaining:Math.max(0,deadline-at),playable:(released||board.phase==='playing')&&at<deadline};
}
export const tripFlipDots=(board:TripFlipBoard,remaining:number)=>Math.min(board.rules.dots,Math.max(0,Math.ceil(remaining/board.rules.dotMs)));
export const tripFlipCard=(board:TripFlipBoard,location:number)=>location<4?board.columns[location]?.at(-1):location<7?board.cells[location-4]:board.fan[0];
export function acceptTripFlipSnapshot(old:TripFlipSnapshot|null,next:TripFlipSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Trip Flip snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:TripFlipSnapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...player})=>player)});
  if(semantic(old)!==semantic(next))throw Error('Trip Flip conflicting snapshot');
 }return next;
}
export function multiplayerSnapshot(v:any):TripFlipSnapshot {
 const id=v.identity.dealerGameId,scope=[id,v.identity.roundId,v.activePlayerId,v.stage].join(':');
 const {rules,phase,columns,cells,fan,special,specialClaimed,legalMoves,stockRemaining,trips,runs,suitedTotal,specialTotal,highScore,score,deadline,event}=v;
 return {identity:v.identity,financial:v.financial,settlement:v.settlement,results:v.stages,viewerId:v.viewerId,terminal:v.terminal,id,revision:v.revision,serverAt:v.serverAt,scope,round:v.stage,
 board:{rules,phase,columns,cells,fan,special,specialClaimed,legalMoves,stockRemaining,trips,runs,suitedTotal,specialTotal,highScore,score,deadline,event,result:v.phase==='stage_complete'?v.stages.at(-1):null},
 canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,solo:false,
 players:v.players.map((p:any)=>({id:p.id,seat:p.seat,name:p.name,score:v.scores[p.id]??0,active:p.id===v.activePlayerId,chips:v.financial?.balances[p.id]}))};
}
export function arcadeSnapshot(v:any,userId:string):TripFlipSnapshot {return {id:v.id,revision:v.revision,serverAt:v.serverAt,scope:v.view.roundId,round:v.view.round,board:v.view,canAct:v.status==='active',paused:false,finished:v.status!=='active',abandoned:v.status==='abandoned',settled:false,solo:true,completion:v.completion,players:[{id:userId,name:'You',score:v.score,active:true}]};}
