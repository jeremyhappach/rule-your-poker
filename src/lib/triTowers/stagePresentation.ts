import type {Projection} from './model';

/** Pure projection of the server window: rerenders/reconnects cannot restart it. */
export function stagePresentation(view:Projection,now:number){
  if(view.phase!=='stage_complete')return null;
  const result=view.stages.at(-1);
  if(!result||result.playerId!==view.activePlayerId||result.stage!==view.stage)return null;
  const before=result.scoreBefore??view.stages.filter(r=>r.playerId===result.playerId&&r.stage<result.stage).at(-1)?.score??0;
  const elapsed=Math.max(0,view.rules.holdMs-(view.deadline-(view.paused?(view.pausedAt??view.serverAt):now)));
  const progress=Math.min(1,elapsed/2800);
  return {...result,id:result.id??[view.identity.dealerGameId,view.identity.roundId,result.playerId,result.stage].join(':'),
    scoreBefore:before,stageScore:result.stageScore??result.score-before,timeBonus:result.timeBonus??view.event.points,
    elapsed,displayScore:Math.round(before+(result.score-before)*progress)};
}
