import type {CompletionRecord,RunStatus} from '@/lib/arcade/model';
export type DropAction='place'|'pass'|'abandon';
export interface DropCommand {requestId:string;revision:number;roundId:string;intent:{type:DropAction;items:number[]}}
export interface LaneResult {vector:number[];selected:number[];natural:boolean;points:number;bonus:number;score:number;category:string;completedAt:number}
export interface DropResult {id?:string;scoreBefore?:number;roundScore?:number;reason:'filled'|'timeout';base:number;allBonus:number;timeBonus:number;score:number;completedAt:number;remainingMs:number}
export interface DropRoundScore {round:number;score:number;handPoints:number;naturalBonus:number;allBonus:number;timeBonus:number}
export interface DropSnapshot {
 id:string;revision:number;status:RunStatus;ruleset:string;serverAt:number;roundId:string;round?:number;rounds?:number;banked?:number;score:number;phase:'intro'|'playing'|'stage_complete'|'complete';
 lanes:number[][];laneResults:(LaneResult|null)[];current:number|null;stockLeft:number;passesLeft:number;placements:number;
 startedAt:number;deadline:number;result:DropResult|null;roundScores?:DropRoundScore[];completion:CompletionRecord|null;
}
export const laneSizes=[3,5,7] as const;
export const cardRank=(card:number)=>card%13===12?15:card%13+2;
export const cardFace=(card:number)=>({rank:['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13] as import('@/lib/cardUtils').Rank,suit:['♣','♦','♥','♠'][Math.floor(card/13)] as import('@/lib/cardUtils').Suit});
