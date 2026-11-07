import type {CompletionRecord,RunStatus} from '@/lib/arcade/model';
export interface BlitzSet {size:number;points:number;label:string}
export interface BlitzBank {hand:number;points:number;roll:number;at:number}
export interface BlitzResult {id:string;round:number;base:number;timerBonus:number;total:number;completedAt:number;reason:'complete'|'timeout'}
export interface BlitzSnapshot {id:string;revision:number;status:RunStatus;ruleset:string;serverAt:number;round:number;roundId:string;hand:number;handId:string;roll:number;dice:number[];held:number[];set:BlitzSet;score:number;base:number;phase:'playing'|'banking'|'summary';deadline:number|null;dueAt:number|null;phaseUntil:number|null;bank:BlitzBank|null;result:BlitzResult|null;completion:CompletionRecord|null}
export type BlitzAction='roll'|'bank'|'next_round'|'abandon';
export interface BlitzCommand {requestId:string;revision:number;roundId:string;intent:{type:BlitzAction;items:number[]}}
