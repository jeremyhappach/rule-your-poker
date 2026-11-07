import type {Card} from '@/lib/cardUtils';
import type {CompletionRecord} from '@/lib/arcade/model';

export type ShowdownAction = 'press' | 'bank' | 'fold' | 'stay' | 'abandon';
export interface ShowdownCommand {
  requestId:string;
  revision:number;
  roundId:string;
  intent:{type:ShowdownAction; level?:number};
}
export interface ShowdownSnapshot {
  id:string; revision:number; status:'active'|'completed'|'abandoned'; ruleset:string;
  serverAt:number; durationMs:number; round:number; roundId:string; hand:number;
  phase:'deal'|'decision'|'showdown'|'win'|'payout'; since:number; due:number;
  fresh:boolean; level:number; levels:number[]; player:Card[]; community:Card[]; chucky:Card[];
  reason:'bank'|'timeout'|'cracked'|'all'|null; beforeRisk:number; risk:number;
  bank:number; completedRounds:number; score:number; completion:CompletionRecord|null;
}

// Presentation seeks the persisted beat. A recovered board never starts its deal over.
export function dealFrame(v:ShowdownSnapshot, elapsed:number){
  const shuffleAt=v.fresh?820:0, boardAt=shuffleAt+850;
  const dealt=(offset:number,max:number)=>Math.max(0,Math.min(max,1+Math.floor((elapsed-offset)/180)));
  return {
    player:v.phase==='deal'&&v.fresh?dealt(0,4):4,
    mixing:v.phase==='deal'&&elapsed>=shuffleAt&&elapsed<boardAt,
    community:v.phase==='deal'?dealt(boardAt,4):4,
    chucky:v.phase==='showdown'?dealt(180,v.level):v.level,
  };
}
export function scoreFrame(v:ShowdownSnapshot, now:number){
  const startDelay=v.phase==='payout'&&v.reason!=='cracked'?190:0;
  const fraction=Math.max(0,Math.min(1,(now-v.since-startDelay)/(900-startDelay)));
  const moving=v.phase==='win'||v.phase==='payout';
  const risk=moving?Math.round(v.beforeRisk+(v.risk-v.beforeRisk)*fraction):v.risk;
  const bank=v.phase==='payout'&&v.reason!=='cracked'?v.bank-risk:v.bank;
  return {risk,bank};
}

export type V2Config={foldMs:number;selectMs:number;maxFolds:number;maxCracks:number}&(
  {version:'chucky-showdown/2'}|{version:'chucky-showdown/3';winBonuses:number[]});
export const winBonus=(config:V2Config,level:number)=>config.version==='chucky-showdown/3'?config.winBonuses[level-1]:100*level;
export const winCue=(cards:number)=>cards===7?'chuckySeven':cards===6?'chuckySix':'chuckyWin';
export interface V2Scene {
  round:number;hand:number;roundId:string;
  phase:'deal'|'fold_stay'|'fold'|'board_reveal'|'choose'|'showdown'|'win'|'crack'|'round_over';
  since:number;due:number;player:Card[];community:Card[];chucky:Card[];
  folds:number;cracks:number;uses:number[];level:number;risk:number;beforeRisk:number;score:number;
  reason:'folds'|'exhausted'|'busted'|null;best:Card[]|null;label:string|null;tie:boolean|null;
}
export interface V2Snapshot extends V2Scene, Pick<ShowdownSnapshot,'id'|'revision'|'status'|'ruleset'|'serverAt'|'completion'> {
  config:V2Config;lastShowdown:V2Scene|null;lastRound:V2Scene|null;lastFold?:V2Scene|null;
}
export type ShowdownView=ShowdownSnapshot|V2Snapshot;
export const isV2=(v:ShowdownView):v is V2Snapshot=>'uses' in v;
