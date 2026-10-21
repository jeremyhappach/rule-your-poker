import type {ChipPresentationBatch} from '../canonicalShell/ChipPresentationLedger';
export type Battle31Intent={type:'swap';items:[number,number]}|{type:'take_pot'|'pass'|'resign'|'autoplay_on'|'autoplay_off'};
export interface Battle31Result {round:number;hands:number[][];values:number[];loser:number|null;reason:string;losses:number[]}
export interface Battle31Board {
 rules:{version:'battle-31/1';turnMs:number;introMs:number;holdMs:number};
 phase:'intro'|'playing'|'round_result'|'complete';deadline:number;dealId:string;turn:number;closing:boolean;
 hands:(number|null)[][];center:number[];values:(number|null)[];losses:number[];event:{label:string};result:Battle31Result|null;
}
export interface Battle31Snapshot {
 id:string;revision:number;serverAt:number;scope:string;round:number;stake:number;viewerId:string;board:Battle31Board;canAct:boolean;paused:boolean;pausedAt:number|null;finished:boolean;settled:boolean;
 identity:{sessionId:string;dealerGameId:string;roundId:string};
 players:{id:string;name:string;seat:number;chips:number;active:boolean;losses:number;isBot?:boolean;autoPlay?:boolean;sitOutNextHand?:boolean}[];
 results:Battle31Result[];settlement:Record<string,number>|null;
 terminal?:{resultId:string;winnerIds:string[];startedAt:number;deadline:number;outcome:string};
 financial?:{balances:Record<string,number>;resultId:string|null;batch:ChipPresentationBatch|null};
}
export function battle31PlayWindow(board:Battle31Board,at:number){return {playable:board.phase==='playing'&&at<board.deadline,remaining:Math.max(0,board.deadline-at)};}
export function acceptBattle31Snapshot(old:Battle31Snapshot|null,next:Battle31Snapshot,id:string){
 if(next.id!==id||!Number.isSafeInteger(next.revision)||next.board.rules.version!=='battle-31/1')throw Error('Battle 31 snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 if(old&&old.revision===next.revision){const semantic=(s:Battle31Snapshot)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...p})=>p)});if(semantic(old)!==semantic(next))throw Error('Battle 31 conflicting snapshot');}
 return next;
}
// RPC result remains untrusted until its identity/revision and visibility contract are checked.
export function multiplayerSnapshot(v:any):Battle31Snapshot {
 const viewerIndex=v.players.findIndex((p:any)=>p.id===v.viewerId);
 if(!['round_result','complete'].includes(v.phase)&&v.hands.some((h:any[],i:number)=>i!==viewerIndex&&h.some(c=>c!==null)))throw Error('Battle 31 private projection rejected');
 const {rules,phase,deadline,dealId,turn,closing,hands,center,values,losses,event,result}=v;
 return {id:v.identity.dealerGameId,identity:v.identity,revision:v.revision,serverAt:v.serverAt,scope:dealId,round:v.stage,stake:v.stake,viewerId:v.viewerId,
 board:{rules,phase,deadline,dealId,turn,closing,hands,center,values,losses,event,result},canAct:v.canAct,paused:v.paused,pausedAt:v.pausedAt,finished:v.finished,settled:v.settlement!==null,
 players:v.players.map((p:any,i:number)=>({id:p.id,name:p.name,seat:p.seat,chips:v.financial?.balances[p.id]??p.chips,active:p.id===v.activePlayerId,isBot:p.isBot===true,autoPlay:p.autoPlay===true,sitOutNextHand:p.sitOutNextHand===true,losses:v.losses[i]})),results:v.results,settlement:v.settlement,terminal:v.terminal,financial:v.financial};
}
