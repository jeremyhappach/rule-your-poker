export type RoyalIntent={type:'place';index:number}|{type:'take_score'|'abandon'};
export interface RoyalResult {presentationMs?:number;presentationVersion?:number;lines?:{kind:string;points:number}[];slots?:(number|null)[];id?:string;reason:string;score:number;scoreBefore:number;displayScore:number;stageScore:number;handPoints:number;timeBonus:number;completedAt:number}
export interface RoyalBoard {
 rules:{version:'royal-flash/1'|'royal-flash/2';stageMs:number;introMs:number;readyMs:number;holdMs:number;clearCelebrationMs:number};
 phase:'intro'|'ready'|'playing'|'stage_complete'|'complete';slots:(number|null)[];current:number|null;
 stockRemaining:number;placements:number;handPoints:number;lines:{kind:string;points:number}[];score:number;deadline:number;
 result?:RoyalResult|null;event:{label:string;points:number;slot?:number};
}
export interface RoyalSnapshot {
 viewerId?:string;
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number;achievements:Record<string,import('../arcade/scoreAchievements').ScoreAchievements>};
 abandoned?:boolean;
 identity?:{sessionId:string;dealerGameId:string;roundId:string};
 financial?:{balances:Record<string,number>;resultId:string|null;batch:import('../canonicalShell/ChipPresentationLedger').ChipPresentationBatch|null};
 settlement?:Record<string,number>|null;
 results?:(RoyalResult&{id:string;playerId:string;stage:number})[];
 completion?:import('../arcade/model').CompletionRecord|null;
 id:string;revision:number;serverAt:number;scope:string;round:number;board:RoyalBoard;
 canAct:boolean;paused:boolean;pausedAt?:number|null;finished:boolean;settled:boolean;solo:boolean;
 players:{id:string;name:string;score:number;active:boolean;seat?:number;chips?:number}[];
}
export function acceptRoyalSnapshot(old:RoyalSnapshot|null,next:RoyalSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Royal Flash snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:RoyalSnapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...player})=>player)});
  if(semantic(old)!==semantic(next))throw Error('Royal Flash conflicting snapshot');
 }
 return next;
}
export function multiplayerSnapshot(v:any):RoyalSnapshot {
 const id=v.identity.dealerGameId,scope=[id,v.identity.roundId,v.activePlayerId,v.stage].join(':');
 const {rules,phase,slots,current,stockRemaining,placements,handPoints,lines,score,deadline,event}=v;
 return {identity:v.identity,financial:v.financial,settlement:v.settlement,results:v.stages,viewerId:v.viewerId,terminal:v.terminal,id,revision:v.revision,serverAt:v.serverAt,scope,round:v.stage,board:{rules,phase,slots,current,stockRemaining,placements,handPoints,lines,score,deadline,event,result:v.phase==='stage_complete'?v.stages.at(-1):null},canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,solo:false,
 players:v.players.map((p:any)=>({id:p.id,seat:p.seat,name:p.name,score:v.scores[p.id]??0,active:p.id===v.activePlayerId,chips:v.financial?.balances[p.id]}))};
}
export function arcadeSnapshot(v:any,userId:string):RoyalSnapshot {
 return {id:v.id,revision:v.revision,serverAt:v.serverAt,scope:v.view.roundId,round:v.view.round,board:v.view,canAct:v.status==='active',paused:false,finished:v.status!=='active',abandoned:v.status==='abandoned',settled:false,solo:true,completion:v.completion,players:[{id:userId,name:'You',score:v.score,active:true}]};
}
