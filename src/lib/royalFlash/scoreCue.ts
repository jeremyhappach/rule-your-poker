import type {AudioCue} from '../audio/audioManager';
import {scoreCountCue} from '../run21/scoreCountCue';
import type {RoyalResult} from './model';
import {royalScoreSteps} from './scoringPresentation';

/** Schedule future count windows once on the shared audio clock, not after each highlight. */
export function royalScoreCue(result:RoyalResult,elapsed:number,remaining:number):AudioCue {
 const steps=royalScoreSteps(result)??[];
 return {durationMs:Math.max(0,remaining-5),schedule(ctx,destination,track){
  for(const step of steps){
   const at=Math.max(0,elapsed-step.offset),left=step.countMs-at;
   if(step.points<=0||left<=30)continue;
   scoreCountCue(step.from,step.to,at,left,Math.max(0,step.offset-elapsed),true).schedule(ctx,destination,track);
  }
  return true;
 }};
}
