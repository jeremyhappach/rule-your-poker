import type {ChildSummary,Home} from './client';
import type {RoundState} from '../../../server/fiveAlive/rules';

// Boards are already projected by the server's game-specific privacy owners.
export interface RecordedAttempt {
 actor:string;round:number;score:number;at:number;board:Record<string,any>|null;
}
export interface GameRecord {
 id:string;matchId:string;game:ChildSummary['game'];config:Record<string,any>;
 attempts:RecordedAttempt[];board:Record<string,any>|null;
 words:{players:string[];rounds:RoundState[][]}|null;
}
export interface MatchRecord {home:Home;detail:GameRecord|null}
export const matchRecordPath=(matchId:string,childId?:string)=>
 '/delayed/'+matchId+'?history=1'+(childId?'&game='+childId:'');

export function validateMatchRecord(value:MatchRecord,matchId:string,userId:string,childId?:string){
 if(value.home.id!==matchId||value.home.status!=='settled'||!value.home.receipt||
  ![value.home.organizer,value.home.opponent].includes(userId)||
  (childId&&(!value.detail||value.detail.id!==childId||value.detail.matchId!==matchId||
   !value.home.lineup.some(c=>c.id===childId&&c.terminal&&c.game===value.detail!.game))))
  throw Error('Completed match record unavailable.');
 return value;
}
