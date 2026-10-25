import {golfCard,type GolfSnapshot} from '@/lib/golf/model';
import {golfPublicValue} from '@/lib/golf/scoring';
export {golfPublicValue,golfVisibleSubtotal} from '@/lib/golf/scoring';
import {golfScoreLabel} from '@/lib/golf/scoreLabel';
export const signedGolf=golfScoreLabel;
export interface GolfScoreBeat {playerId:string;indices:number[];scored:number[];hidden:number[];text:string;subtotal:number;duration:number;kind:'intro'|'reveal'|'card'|'total'|'exit'}
export function golfScoreBeats(v:GolfSnapshot):GolfScoreBeat[]{
 if(!['hole_complete','complete'].includes(v.phase)||!v.holes.some(h=>h.roundId===v.scope)||v.players.some(p=>v.tableaus[p.id].cards.some(c=>c===null)))return [];
 const result=v.holes.find(h=>h.roundId===v.scope)!;
 const order=[...v.players.filter(p=>p.id!==v.viewerId),...v.players.filter(p=>p.id===v.viewerId)];
 const delay=v.rules.presentation?.scoringDelayMs??650;
 return order.flatMap(p=>{let subtotal=0;const hidden=[...(v.presentation?.hidden[p.id]??[])];const cards=v.tableaus[p.id].cards as number[],scored:number[]=[],beats:GolfScoreBeat[]=[{playerId:p.id,indices:[],scored:[],hidden:[...hidden],text:'Scoring '+p.name+"'s Hand",subtotal:0,duration:700,kind:'intro'}];
 for(const index of [...hidden]){beats.push({playerId:p.id,indices:[index],scored:[],hidden:[...hidden],text:'Revealing '+p.name+"'s Hand",subtotal:0,duration:delay,kind:'reveal'});hidden.splice(hidden.indexOf(index),1);}
 for(let i=0;i<3;i++){const pair=cards[i]%13===cards[i+3]%13;for(const indices of pair?[[i,i+3]]:[[i],[i+3]]){const value=pair?0:golfPublicValue(cards[indices[0]]);subtotal+=value;beats.push({playerId:p.id,indices,scored:[...scored],hidden:[],subtotal,text:pair?'Pair: E':golfCard(cards[indices[0]])!.rank+': '+signedGolf(value),duration:delay,kind:'card'});scored.push(...indices);}}
 beats.push({playerId:p.id,indices:[],scored:[0,1,2,3,4,5],hidden:[],text:p.name+' Final Score: '+signedGolf(result.scores[p.id]),subtotal:result.scores[p.id],duration:2000,kind:'total'},{playerId:p.id,indices:[],scored:[],hidden:[],text:'',subtotal:result.scores[p.id],duration:180,kind:'exit'});return beats;});
}
export function golfScoreFrame(v:GolfSnapshot,now:number,seek:boolean){
 const beats=golfScoreBeats(v),natural=beats.reduce((n,b)=>n+b.duration,0);
 if(v.presentation){const schedule=v.presentation;let elapsed=now-schedule.startedAt,index=0;const results=now>=schedule.resultsAt&&now<schedule.endsAt;
  if(now>=schedule.resultsAt)return {beat:null,index:-1,results,naturalMs:schedule.endsAt-schedule.startedAt};
  for(const beat of beats){if(elapsed<beat.duration)return {beat,index,beatElapsedMs:Math.max(0,elapsed),results:false,seeked:seek,naturalMs:schedule.endsAt-schedule.startedAt};elapsed-=beat.duration;index++;}
  return {beat:null,index:-1,results:false,naturalMs:schedule.endsAt-schedule.startedAt};
 }
 const windowMs=((v.rules as {holeResultSeconds?:number}).holeResultSeconds??6)*1000;
 const end=v.terminal?Math.min(v.deadline,v.terminal.deadline):v.deadline;
 const available=Math.max(1,end-(v.deadline-windowMs)-1400),scale=Math.min(1,available/Math.max(1,natural));
 let elapsed=now-(v.deadline-windowMs),index=0;
 if(seek||!beats.length)return {beat:null,index:-1,results:true,naturalMs:natural+1400};
 for(const beat of beats){if(elapsed<beat.duration*scale)return {beat,index,results:false,naturalMs:natural+1400};elapsed-=beat.duration*scale;index++;}
 return {beat:null,index:-1,results:true,naturalMs:natural+1400};
}
