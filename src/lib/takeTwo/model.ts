export type TakeTwoIntent={type:'pair';items:[number,number]}|{type:'draw'|'take_score'|'abandon'};
export interface TakeTwoResult {id?:string;reason:string;score:number;scoreBefore:number;displayScore:number;stageScore:number;clearBonus:number;stockBonus:number;timeBonus:number;completedAt:number}
export interface TakeTwoBoard {
 rules:{version:'take-two/1';stageMs:number;introMs:number;holdMs:number;meterMin:number;meterMax:number;meterStep:number;meterStepsPerSecond:number;meterHoldMs:number};
 phase:'intro'|'playing'|'stage_complete'|'complete';slots:(number|null)[];current:number|null;
 layout:{row:number;column:number;x:number}[];legalPairs:[number,number][];exposed:number[];
 highScore:number;stockRemaining:number;samePairs:number;consecutivePairs:number;meterAt:number;score:number;deadline:number;
 result?:TakeTwoResult|null;event:{label:string;points:number};
}
export interface TakeTwoSnapshot {
 viewerId?:string;terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number;achievements:Record<string,import('../arcade/scoreAchievements').ScoreAchievements>};
 abandoned?:boolean;identity?:{sessionId:string;dealerGameId:string;roundId:string};
 financial?:{balances:Record<string,number>;resultId:string|null;batch:import('../canonicalShell/ChipPresentationLedger').ChipPresentationBatch|null};settlement?:Record<string,number>|null;
 results?:(TakeTwoResult&{id:string;playerId:string;stage:number})[];completion?:import('../arcade/model').CompletionRecord|null;
 id:string;revision:number;serverAt:number;scope:string;round:number;board:TakeTwoBoard;canAct:boolean;paused:boolean;pausedAt?:number|null;finished:boolean;settled:boolean;solo:boolean;
 players:{id:string;name:string;score:number;active:boolean;seat?:number;chips?:number}[];
}
/** Presentation of the frozen server deadline; this never advances gameplay. */
export function takeTwoPlayWindow(board:TakeTwoBoard,at:number,releaseIntro=true){
 const released=releaseIntro&&board.phase==='intro'&&at>=board.deadline;
 const deadline=released?board.deadline+board.rules.stageMs:board.deadline;
 return {phase:released?'playing':board.phase,remaining:Math.max(0,deadline-at),playable:(released||board.phase==='playing')&&at<deadline};
}
export function takeTwoMeter(board:TakeTwoBoard,at:number){const r=board.rules;return Math.max(r.meterMin,r.meterMax-r.meterStep*Math.floor(Math.max(0,at-board.meterAt-r.meterHoldMs)*r.meterStepsPerSecond/1000));}
export function acceptTakeTwoSnapshot(old:TakeTwoSnapshot|null,next:TakeTwoSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Take 2 snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:TakeTwoSnapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...player})=>player)});
  if(semantic(old)!==semantic(next))throw Error('Take 2 conflicting snapshot');
 }return next;
}
export function multiplayerSnapshot(v:any):TakeTwoSnapshot {
 const id=v.identity.dealerGameId,scope=[id,v.identity.roundId,v.activePlayerId,v.stage].join(':');
 const {rules,phase,slots,current,stockRemaining,layout,legalPairs,exposed,samePairs,consecutivePairs,meterAt,highScore,score,deadline,event}=v;
 return {identity:v.identity,financial:v.financial,settlement:v.settlement,results:v.stages,viewerId:v.viewerId,terminal:v.terminal,id,revision:v.revision,serverAt:v.serverAt,scope,round:v.stage,
 board:{rules,phase,slots,current,stockRemaining,layout,legalPairs,exposed,samePairs,consecutivePairs,meterAt,highScore,score,deadline,event,result:v.phase==='stage_complete'?v.stages.at(-1):null},
 canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,solo:false,
 players:v.players.map((p:any)=>({id:p.id,seat:p.seat,name:p.name,score:v.scores[p.id]??0,active:p.id===v.activePlayerId,chips:v.financial?.balances[p.id]}))};
}
export function arcadeSnapshot(v:any,userId:string):TakeTwoSnapshot {return {id:v.id,revision:v.revision,serverAt:v.serverAt,scope:v.view.roundId,round:v.view.round,board:v.view,canAct:v.status==='active',paused:false,finished:v.status!=='active',abandoned:v.status==='abandoned',settled:false,solo:true,completion:v.completion,players:[{id:userId,name:'You',score:v.score,active:true}]};}
