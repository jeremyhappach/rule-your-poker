import {calculateCategoryScore} from '../yahtzeeScoring';
export const QUINTZEE_CATEGORIES = ['ones','twos','threes','fours','fives','sixes','three_of_a_kind','four_of_a_kind','yahtzee','full_house','large_straight','chance'] as const;
export type QuintzeeCategory = typeof QUINTZEE_CATEGORIES[number];
export type QuintzeeTheme = 'classic'|'modern';
export const QUINTZEE_LABELS:Record<QuintzeeCategory,string> = {ones:'Ones',twos:'Twos',threes:'Threes',fours:'Fours',fives:'Fives',sixes:'Sixes',three_of_a_kind:'Three alike',four_of_a_kind:'Four alike',yahtzee:'Five alike',full_house:'Full house',large_straight:'Straight',chance:'Any'};
export interface QuintzeeRules {version:'quintzee/1';durationMs:number;clearBonus:number;upperThreshold:63;upperBonus:35;bonusThreshold:80000;rounds:2;maxRounds:3;introMs:number;resultMs:number;speedMin:100;speedRange:200}
export interface QuintzeeResult {reason:'all_categories'|'timeout'|'no_matches';categorySubtotal:number;upperSubtotal:number;upperBonus:number;clearBonus:number;rawSubtotal:number;multiplier:number;remainingMs:number;stageScore:number;scoreBefore:number;score:number;completedAt:number;playerId?:string;round?:number}
export interface QuintzeeBoard {rules:QuintzeeRules;phase:'intro'|'playing'|'stage_complete';deadline:number;startedAt?:number;dice:number[];held:number[];rollsRemaining:number;rollSerial:number;scores:Partial<Record<QuintzeeCategory,number>>;potentials:Partial<Record<QuintzeeCategory,number>>;scoreBefore:number;score:number;result:QuintzeeResult|null}
export interface QuintzeeState {rules:QuintzeeRules;players:string[];scores:Record<string,number>;round:number;turnIndex:number;qualified:string[];results:QuintzeeResult[];finished:boolean;board:QuintzeeBoard}
export interface QuintzeeSnapshot {id:string;revision:number;scope:string;serverAt:number;state:QuintzeeState;theme:QuintzeeTheme;pausedAt:number|null;outcome:string;status:'active'|'completed'|'abandoned';playerNames?:Record<string,string>}
export interface QuintzeeIntent {type:'roll'|'score'|'abandon';items:number[]}
/** Preview only. The database independently validates and computes every score. */
export function quintzeeBasePreview(category:QuintzeeCategory,dice:readonly number[]):number {
 if(!QUINTZEE_CATEGORIES.includes(category)||dice.length!==5||dice.some(d=>!Number.isInteger(d)||d<1||d>6))throw Error('Invalid Quintzee dice/category');
 return calculateCategoryScore(category,[...dice]);
}
/** Display interpolation, never submitted as score or elapsed time. */
export function quintzeeClock(board:QuintzeeBoard,serverNow:number){
 const remaining=board.phase==='intro'?board.rules.durationMs:board.result?.remainingMs??Math.max(0,Math.min(board.rules.durationMs,board.deadline-serverNow));
 return {remaining,multiplier:board.result?.multiplier??100+Math.floor(200*remaining/board.rules.durationMs)};
}
export function acceptQuintzeeSnapshot(current:QuintzeeSnapshot|null,next:QuintzeeSnapshot):boolean {
 if(!current)return true;
 if(current.id!==next.id||next.revision<current.revision)return false;
 if(next.revision===current.revision)return JSON.stringify(current.state)===JSON.stringify(next.state)&&current.theme===next.theme&&current.pausedAt===next.pausedAt&&current.scope===next.scope&&current.status===next.status&&JSON.stringify(current.playerNames)===JSON.stringify(next.playerNames);
 return true;
}
