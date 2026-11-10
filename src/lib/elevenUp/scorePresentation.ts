import {clampUnit} from '@/lib/triTowers/roundTimeline';
import {triAllClearCueAt} from '@/lib/triTowers/allClearCue';

// Fits the existing 5s result hold (+3s for all-clear). No progression owner.
export const elevenScoreSequence=(celebrationMs:number)=>({
 namespace:'eleven',clearMs:celebrationMs,clearCueAt:triAllClearCueAt,seekOnRecovery:false,
 countWindow:(cleared:boolean)=>({start:(cleared?celebrationMs:0)+700,end:(cleared?celebrationMs:0)+3300}),
 timeline:(elapsed:number,cleared:boolean)=>{
  const t=elapsed-(cleared?celebrationMs:0);
  return {progress:clampUnit((t-700)/2600),center:Math.min(clampUnit(t/250),clampUnit((4500-t)/300)),crest:clampUnit((celebrationMs-elapsed)/350)};
 }
});
