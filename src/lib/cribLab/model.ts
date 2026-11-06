import type {Rank,Suit} from '@/lib/cardUtils';
import type {CompletionRecord,RunStatus} from '@/lib/arcade/model';

export const suitGlyph = {spades:'♠',hearts:'♥',diamonds:'♦',clubs:'♣'} as const satisfies Record<string,Suit>;
export type LabCard = {rank:Rank;suit:keyof typeof suitGlyph;value:number};
export type Counts = {fifteens:number;pairs:number;runs:number;flush:number;nobs:number;total:number};
export type ComboKind='fifteen'|'pair'|'run'|'flush'|'nobs';
export interface CountStep {hand:number;kind:ComboKind|'subtotal';mask:number;points:number;from:number;at:number;ms:number}
export interface CountScript {beats:CountStep[];baseAt:number;awardAt:number;totalAt:number;endAt:number}
export interface LabTransition {id:string;phase:'discard'|'stock'|'cut'|'swap';startsAt:number;endsAt:number}
export interface RoundResult {
  presentation?:CountScript;
  id:string; hands:Counts[]; base:number; multiplier:number; award:number; before:number; cumulative:number; scoredAt:number;
}
export interface LabSnapshot {
  id:string; revision:number; ruleset:string; status:RunStatus; serverAt:number; round:number; roundId:string;
  phase:'discard'|'stock'|'cut'|'swap'|'scoring'; hands:LabCard[][]; discardMasks:number[];
  stockLeft:number; swapsLeft:number; offer:LabCard|null; cut:LabCard|null; durationMs:number;
  transition?:LabTransition|null; deadline:number; phaseUntil:number|null; score:number; result:RoundResult|null; completion:CompletionRecord|null;
}
export type LabAction='select'|'lock'|'pass'|'replace'|'swap'|'stand'|'abandon';
export interface LabCommand {requestId:string; revision:number; roundId:string; intent:{type:LabAction;items:number[]}}
export const pairSelected=(mask:number)=>mask!==0&&(mask&(mask-1))!==0;
type ScoreFrame={
  stage:'hand'|'combo'|'subtotal'|'equation'|'total';index:number;baseScore:number;gameTotal:number;
  at:number;ms:number;points:number;mask:number;label:string;
};
const fraction=(t:number)=>Math.max(0,Math.min(1,t));
const comboName:Record<ComboKind,string>={fifteen:'Fifteen',pair:'Pair',run:'Run',flush:'Flush',nobs:'Nobs'};

export function totalCountWindow(r:RoundResult){
  return {from:r.before,to:r.cumulative,startedAt:r.scoredAt+(r.presentation?.totalAt??8600),
    endsAt:r.scoredAt+(r.presentation?r.presentation.endAt-400:9500)};
}

export function scoreBeat(r:RoundResult,now:number):ScoreFrame {
  const script=r.presentation,elapsed=Math.max(0,now-r.scoredAt),baseAt=script?.baseAt??6000;
  const frame={index:4,baseScore:r.base,gameTotal:r.before,at:baseAt,ms:0,points:0,mask:0,label:''};
  if(elapsed>=baseAt){
    const window=totalCountWindow(r);
    if(now<window.startedAt)return {...frame,stage:'equation'};
    const progress=fraction((now-window.startedAt)/(window.endsAt-window.startedAt));
    return {...frame,stage:'total',at:window.startedAt-r.scoredAt,
      gameTotal:window.from+Math.round((window.to-window.from)*progress)};
  }
  if(!script){
    const index=Math.floor(elapsed/1200),at=index*1200,points=r.hands[index].total;
    const prior=r.hands.slice(0,index).reduce((sum,hand)=>sum+hand.total,0);
    return {...frame,stage:'hand',index,at,ms:1080,points,baseScore:prior+Math.round(points*fraction((elapsed-at-550)/550))};
  }
  const step=script.beats.find(b=>b.at+b.ms>elapsed);
  if(!step)return {...frame,stage:'equation'};
  const count=step.kind!=='subtotal';
  return {...frame,stage:count?'combo':'subtotal',index:step.hand,at:step.at,ms:step.ms,points:step.points,mask:step.mask,
    label:step.kind==='subtotal'?'Hand subtotal':step.kind==='run'?'Run of '+step.points:comboName[step.kind],
    baseScore:step.from+(count?Math.round(step.points*fraction(((elapsed-step.at)/step.ms-.25)/.65)):0)};
}
export function decisionTimeLeft(v:LabSnapshot,now:number){
  return Math.max(0,Math.min(v.durationMs,v.deadline-(v.result?.scoredAt??v.transition?.endsAt??now)));
}
