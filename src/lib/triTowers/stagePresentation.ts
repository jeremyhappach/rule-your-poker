import type {Projection} from './model';

export function roundResultPresentation<T extends {id:string;score:number;scoreBefore:number;stageScore:number;timeBonus:number;reason?:string}>(result:T,deadline:number,holdMs:number,now:number,celebrationMs=0){
 const elapsed=Math.max(0,holdMs+(result.reason==='cleared'?celebrationMs:0)-(deadline-now));
 return {...result,elapsed,displayScore:Math.round(result.scoreBefore+(result.score-result.scoreBefore)*Math.min(1,elapsed/2800))};
}

/** Pure projection of the server window: rerenders/reconnects cannot restart it. */
export function stagePresentation(view:Projection,now:number){
  if(view.phase!=='stage_complete')return null;
  const result=view.stages.at(-1);
  if(!result||result.playerId!==view.activePlayerId||result.stage!==view.stage)return null;
  const before=result.scoreBefore??view.stages.filter(r=>r.playerId===result.playerId&&r.stage<result.stage).at(-1)?.score??0;
  return roundResultPresentation({...result,id:result.id??[view.identity.dealerGameId,view.identity.roundId,result.playerId,result.stage].join(':'),
    scoreBefore:before,stageScore:result.stageScore??result.score-before,timeBonus:result.timeBonus??view.event.points,
    },view.deadline,view.rules.holdMs,view.paused?(view.pausedAt??view.serverAt):now,view.rules.clearCelebrationMs??0);
}
