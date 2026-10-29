import {SCORE_PRESENTATION_MS,type Config} from '@/lib/run21/model';
import {medalDuration} from '@/lib/run21/rulesets';
import {SCORE_HOLD,SCORE_FLIGHT,SCORE_AFTER} from '@/lib/ptownWords/scorePresentation';
import {triCountWindow,TRI_ROUND_TIMELINE} from '@/lib/triTowers/roundTimeline';
import type {ReviewEvent} from './reviews';
import type {Home} from './client';
export const ASYNC_SCORE_HOLD_MS=3000;
/** Only acknowledged earlier contributions plus the one currently being revealed.
 * Saved board totals may include other unseen rounds and are never the baseline. */
export function reviewScoreContext(event:ReviewEvent,events:ReviewEvent[],home:Home,childId:string,userId:string){
 const actor=event.actor!,prior=new Map(events.filter(e=>e.kind==='attempt'&&e.actor===actor&&e.seen&&e.round<event.round).map(e=>[e.id,e]));
 const before=[...prior.values()].reduce((sum,e)=>sum+(e.score??0),0),after=before+(event.score??0);
 const own=home.lineup.find(c=>c.id===childId)?.scores?.[userId]??0;
 return {before,after,players:home.players.map(p=>({...p,score:p.id===actor?after:own,active:p.id===actor}))};
}
/** Rebase saved timestamps only; use the frozen game's existing presentation schedule. */
export function reviewSchedule(event:ReviewEvent){
 const b=event.board,r=b?.result,rules=b?.rules??event.receipt.rules;
 if(!b)return {duration:SCORE_HOLD+SCORE_AFTER,countStart:0,countEnd:SCORE_HOLD,presentationEnd:SCORE_HOLD+SCORE_AFTER,medal:0};
 if(event.receipt.game==='run21'){
  const medal=r?.score>0&&(r.aggregate===104||r.aggregate===105)?medalDuration(rules as Config,r.aggregate):0;
  return {duration:medal+SCORE_PRESENTATION_MS,countStart:medal,countEnd:medal+SCORE_PRESENTATION_MS,presentationEnd:medal+SCORE_PRESENTATION_MS,medal};
 }
 if(event.receipt.game==='ptown-words'){
  const p=b.movePresentation,start=p?Math.max(0,p.announceAt-p.startedAt):0;
  return {duration:start+SCORE_HOLD+SCORE_FLIGHT+SCORE_AFTER,countStart:start+SCORE_HOLD,countEnd:start+SCORE_HOLD+SCORE_FLIGHT,presentationEnd:start+SCORE_HOLD+SCORE_FLIGHT+SCORE_AFTER,medal:0};
 }
 const tri=event.receipt.game==='tri-towers',box=event.receipt.game==='boxdrop',clear=r?.reason===(box?'full_clear':'cleared');
 const celebration=clear?(tri?rules.clearCelebrationMs??0:box?3000:0):0;
 const window=tri&&!['tri-towers/3','tri-towers/4','tri-towers/5'].includes(rules.version)?{start:0,end:2800}:triCountWindow(clear,celebration);
 return {duration:Math.max(window.end,tri?rules.holdMs+celebration:box?rules.holdMs:rules.resultMs),countStart:window.start,countEnd:window.end,presentationEnd:tri&&!['tri-towers/3','tri-towers/4','tri-towers/5'].includes(rules.version)?3100:celebration+TRI_ROUND_TIMELINE.homeAt,medal:0};
}
export function rebaseReviewBoard(event:ReviewEvent,origin:number,scoreBefore?:number){
 if(!event.board)return null;const b=structuredClone(event.board),schedule=reviewSchedule(event);
 b.deadline=origin+schedule.duration;
 if(b.result){b.result.at=origin;b.result.completedAt=origin;}
 if(scoreBefore!==undefined&&event.receipt.game!=='run21'&&event.receipt.game!=='ptown-words'){
  b.scoreBefore=scoreBefore;b.score=scoreBefore+(event.score??0);
  if(b.result){b.result.scoreBefore=scoreBefore;b.result.score=b.score;b.result.displayScore=b.score;}
 }
 if(b.celebration)b.celebration=null;
 if(b.movePresentation){const p=b.movePresentation,delta=origin-p.startedAt;for(const key of ['startedAt','announceAt','readyAt'])p[key]+=delta;}
 return b;
}
