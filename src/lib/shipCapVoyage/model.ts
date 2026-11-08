import type {CompletionRecord,RunStatus} from '@/lib/arcade/model';
export interface VoyageBank {cargo:number;roll:number;base:number;bonus:number;points:number}
export interface VoyageResult {id:string;round:number;banks:VoyageBank[];total:number;completedAt:number;reason:'complete'|'incomplete'}
export interface VoyageSnapshot {id:string;revision:number;status:RunStatus;ruleset:string;serverAt:number;round:number;roundId:string;startedAt:number;dueAt?:number|null;roll:number;dice:number[];locked:number[];cargo:number|null;quote:{base:number;bonus:number;points:number}|null;banks:VoyageBank[];results:VoyageResult[];score:number;phase:'playing'|'summary';result:VoyageResult|null;completion:CompletionRecord|null}
export type VoyageAction='roll'|'bank'|'next_round'|'abandon';
export interface VoyageCommand {requestId:string;revision:number;roundId:string;intent:{type:VoyageAction;items:number[]}}
// Presentation of the frozen server table; never submits or awards points.
export const cargoBase=[0,0,0,30,45,65,90,125,175,250,365,530,800] as const;
