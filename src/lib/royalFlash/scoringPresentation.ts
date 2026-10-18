import type {RoyalBoard,RoyalResult} from './model';

const names:Record<string,string>={royal_flush:'Royal Flush',straight_flush:'Straight Flush',four_kind:'Four of a Kind',full_house:'Full House',flush:'Flush',straight:'Straight',three_kind:'Three of a Kind',two_pair:'Two Pair',pair:'One Pair',high_card:'High Card',incomplete:'Incomplete line'};
export interface RoyalScoreStep {key:string;line:number|null;label:string;hand:string;points:number;offset:number;duration:number;countMs:number;from:number;to:number}
export interface RoyalScoreFrame extends RoyalScoreStep {score:number;startedAt:number;endsAt:number}
/** One presentation plan drives visuals and scheduled audio; it never evaluates hands. */
export function royalScoreSteps(r:RoyalResult):RoyalScoreStep[]|null {
 const lines=r.lines,modern=r.presentationVersion===2&&r.presentationMs===21000;
 if(!modern&&r.presentationMs!==15000||!lines||lines.length!==10||lines.some(l=>!Number.isSafeInteger(l.points)||l.points<0||!names[l.kind])||lines.reduce((sum,l)=>sum+l.points,0)!==r.handPoints||r.scoreBefore+r.handPoints+r.timeBonus!==r.score)return null;
 const duration=modern?1600:1000,countMs=modern?1100:600;
 let from=r.scoreBefore;
 const steps:RoyalScoreStep[]=lines.map((line,i)=>{const step={key:`line-${i}`,line:i,label:i<5?`Row ${i+1}`:`Column ${i-4}`,hand:names[line.kind],points:line.points,offset:1000+i*duration,duration,countMs,from,to:from+line.points};from=step.to;return step;});
 steps.push({key:'bonus',line:null,label:'Speed bonus',hand:'',points:r.timeBonus,offset:1000+10*duration,duration:2000,countMs:1100,from,to:r.score});
 return steps;
}
export function royalScoreFrame(board:RoyalBoard,now:number):RoyalScoreFrame|null {
 const r=board.result;if(board.phase!=='stage_complete'||!r)return null;
 const total:RoyalScoreFrame={key:'total',line:null,label:'Round total',hand:'',points:r.stageScore,score:r.score,startedAt:board.deadline,endsAt:board.deadline,from:r.score,to:r.score,offset:0,duration:0,countMs:0};
 const steps=royalScoreSteps(r);if(!steps)return total;
 const start=board.deadline-r.presentationMs!,elapsed=Math.max(0,now-start);
 // A neutral lead-in absorbs normal timeout-recovery latency. No line starts early.
 if(elapsed<steps[0].offset)return {...total,key:'lead',label:'Scoring board',points:0,score:r.scoreBefore,from:r.scoreBefore,to:r.scoreBefore};
 const step=steps.find(s=>elapsed>=s.offset&&elapsed<s.offset+s.duration);if(!step)return total;
 const startedAt=start+step.offset,endsAt=startedAt+step.countMs;
 return {...step,startedAt,endsAt,score:step.from+Math.floor(step.points*Math.min(1,Math.max(0,(now-startedAt)/step.countMs)))};
}
export function royalScoredCell(line:number|null|undefined,index:number){return line!=null&&(line<5?Math.floor(index/5)===line:index%5===line-5);}
