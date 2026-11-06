import type {Rank,Suit} from '@/lib/cardUtils';
import type {CompletionRecord,RunStatus} from '@/lib/arcade/model';

export const suitGlyph = {spades:'♠',hearts:'♥',diamonds:'♦',clubs:'♣'} as const satisfies Record<string,Suit>;
export type LabCard = {rank:Rank;suit:keyof typeof suitGlyph;value:number};
export type Counts = {fifteens:number;pairs:number;runs:number;flush:number;nobs:number;total:number};
export interface RoundResult {
  id:string; hands:Counts[]; base:number; multiplier:number; award:number; before:number; cumulative:number; scoredAt:number;
}
export interface LabSnapshot {
  id:string; revision:number; ruleset:string; status:RunStatus; serverAt:number; round:number; roundId:string;
  phase:'discard'|'stock'|'cut'|'swap'|'scoring'; hands:LabCard[][]; discardMasks:number[];
  stockLeft:number; swapsLeft:number; offer:LabCard|null; cut:LabCard|null; durationMs:number;
  deadline:number; phaseUntil:number|null; score:number; result:RoundResult|null; completion:CompletionRecord|null;
}
export type LabAction='select'|'lock'|'pass'|'replace'|'swap'|'stand'|'abandon';
export interface LabCommand {requestId:string; revision:number; roundId:string; intent:{type:LabAction;items:number[]}}
export const pairSelected=(mask:number)=>mask!==0&&(mask&(mask-1))!==0;
export function scoreBeat(result:RoundResult,now:number) {
  const elapsed=Math.max(0,now-result.scoredAt), index=Math.min(4,Math.floor(elapsed/1200));
  const progress=(start:number,end:number)=>Math.min(1,Math.max(0,(elapsed-start)/(end-start)));
  if(elapsed<6000){
    const prior=result.hands.slice(0,index).reduce((sum,hand)=>sum+hand.total,0);
    return {stage:'hand' as const,index,value:prior+Math.round(result.hands[index].total*progress(index*1200+550,(index+1)*1200-100))};
  }
  if(elapsed<6800)return {stage:'base' as const,index,value:result.base};
  if(elapsed<8600)return {stage:'award' as const,index,value:Math.round(result.base+(result.award-result.base)*progress(7000,8350))};
  return {stage:'total' as const,index,value:result.before+Math.round(result.award*progress(8600,9500))};
}
