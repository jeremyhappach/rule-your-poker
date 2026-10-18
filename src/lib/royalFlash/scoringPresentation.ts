import type {RoyalBoard} from './model';

const names:Record<string,string>={royal_flush:'Royal Flush',straight_flush:'Straight Flush',four_kind:'Four of a Kind',full_house:'Full House',flush:'Flush',straight:'Straight',three_kind:'Three of a Kind',two_pair:'Two Pair',pair:'One Pair',high_card:'High Card',incomplete:'Incomplete line'};
export interface RoyalScoreFrame {key:string;line:number|null;label:string;hand:string;points:number;score:number;startedAt:number;endsAt:number;from:number;to:number}
/** Presentation of immutable server results only. Never evaluates hands or awards points. */
export function royalScoreFrame(board:RoyalBoard,now:number):RoyalScoreFrame|null {
 const r=board.result;
 if(board.phase!=='stage_complete'||!r)return null;
 const total:RoyalScoreFrame={key:'total',line:null,label:'Round total',hand:'',points:r.stageScore,score:r.score,startedAt:board.deadline,endsAt:board.deadline,from:r.score,to:r.score};
 const lines=r.lines;
 if(r.presentationMs!==15000||!lines||lines.length!==10||lines.some(l=>!Number.isSafeInteger(l.points)||l.points<0||!names[l.kind])||lines.reduce((sum,l)=>sum+l.points,0)!==r.handPoints||r.scoreBefore+r.handPoints+r.timeBonus!==r.score)return total;
 const start=board.deadline-r.presentationMs,elapsed=Math.max(0,now-start);
 // Recovery ticks can deliver timeout results up to a second after expiry.
 // Row one remains visible through that lead-in, then every line has a full second.
 const line=elapsed<11000?Math.floor(Math.max(0,elapsed-1000)/1000):null;
 if(elapsed>=13000)return total;
 const from=r.scoreBefore+lines.slice(0,line??10).reduce((sum,l)=>sum+l.points,0);
 const points=line===null?r.timeBonus:lines[line].points;
 const startedAt=start+(line===null?11000:1000+line*1000),endsAt=startedAt+(line===null?1000:600);
 const score=from+Math.floor(points*Math.min(1,Math.max(0,(now-startedAt)/(endsAt-startedAt))));
 return {key:line===null?'bonus':`line-${line}`,line,label:line===null?'Speed bonus':line<5?`Row ${line+1}`:`Column ${line-4}`,hand:line===null?'':names[lines[line].kind],points,score,startedAt,endsAt,from,to:from+points};
}
export function royalScoredCell(line:number|null|undefined,index:number){return line!=null&&(line<5?Math.floor(index/5)===line:index%5===line-5);}
