import type {ChipPresentationBatch} from '../canonicalShell/ChipPresentationLedger';
import type {ScoreAchievements} from '../arcade/scoreAchievements';
export type RacePokerIntent={type:'choose';items:[number]};
export interface RacePokerResult {
 id:string;playerId:string;stage:number;label:string;reason:'hand'|'timeout';points:number;
 scoreBefore:number;score:number;stageScore:number;completedAt:number;hand:number[];
}
export interface RacePokerBoard {
 rules:{version:'race-poker/1';handMs:30000;holdMs:2000;target:48000;roundCap:16};
 phase:'playing'|'stage_complete'|'complete';hand:number[];choices:number[];deadline:number;
 finalHand:boolean;result:RacePokerResult|null;event:{label:string;points:number;slot?:number};
}
export interface RacePokerSnapshot {
 id:string;revision:number;serverAt:number;scope:string;round:number;board:RacePokerBoard;
 identity:{sessionId:string;dealerGameId:string;roundId:string};viewerId:string;
 canAct:boolean;paused:boolean;pausedAt:number|null;finished:boolean;settled:boolean;
 players:{id:string;name:string;score:number;active:boolean;seat:number;chips:number}[];
 results:RacePokerResult[];settlement:Record<string,number>|null;
 financial:{balances:Record<string,number>;resultId:string|null;batch:ChipPresentationBatch|null};
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number;achievements:Record<string,ScoreAchievements>};
}
export function racePokerPlayWindow(b:RacePokerBoard,now:number){
 return {remaining:b.phase==='playing'?Math.max(0,Math.min(30000,b.deadline-now)):0,playable:b.phase==='playing'&&now<b.deadline};
}
export function acceptRacePokerSnapshot(old:RacePokerSnapshot|null,next:RacePokerSnapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Race Poker snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){
  const semantic=(s:RacePokerSnapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...p})=>p)});
  if(semantic(old)!==semantic(next))throw Error('Race Poker conflicting snapshot');
 }
 return next;
}
// The boundary accepts database JSON; never derive scores or draw cards here.
export function multiplayerSnapshot(v:any):RacePokerSnapshot {
 const id=v.identity.dealerGameId;
 return {id,identity:v.identity,revision:v.revision,serverAt:v.serverAt,
  scope:[id,v.identity.roundId,v.stage,v.activePlayerId].join(':'),round:v.stage,viewerId:v.viewerId,
  board:{rules:v.rules,phase:v.phase,hand:v.hand,choices:v.choices,deadline:v.deadline,finalHand:!!v.finalHand,result:v.result,event:v.event},
  canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,
  results:v.stages,settlement:v.settlement,financial:v.financial,terminal:v.terminal,
  players:v.players.map((p:any)=>({id:p.id,name:p.name,seat:p.seat,chips:v.financial.balances[p.id]??p.chips,score:v.scores[p.id]??0,active:p.id===v.activePlayerId}))};
}
