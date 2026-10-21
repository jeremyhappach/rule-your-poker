import type {Card,Rank,Suit} from '@/lib/cardUtils';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
export type GolfIntent={type:'open'|'replace'|'discard';items:number[]}|{type:'draw'|'reject'};
export interface GolfSnapshot {
 id:string;scope:string;stake:number;revision:number;serverAt:number;viewerId:string;
 identity:{sessionId:string;dealerGameId:string;roundId:string};
 rules:{version:'six-card-golf/1';turnSeconds:30;holes:9};
 phase:'opening'|'playing'|'hole_complete'|'complete';hole:number;dealerIndex:number;turnIndex:number;openingRemaining:number;
 players:{id:string;userId:string;name:string;seat:number;isBot:boolean;chips:number}[];
 playerControls?:Record<string,{autoPlay:boolean;sitOutNextHand:boolean;intentVersion:number}>;
 tableaus:Record<string,{cards:(number|null)[];exposed:boolean[]}>;
 scores:Record<string,number>;holes:{hole:number;roundId:string;scores:Record<string,number>}[];
 pending:{actor:string;card:number}|null;hasPending:boolean;stockCount:number;discardTop:number;
 consecutiveNoRevealTurns:number;finalQueue:string[];finalReason:'six_exposed'|'prolonged_play'|null;
 deadline:number;pausedAt:number|null;paused:boolean;canAct:boolean;finished:boolean;settled:boolean;
 settlement:Record<string,number>|null;financial:{balances:Record<string,number>;resultId:string|null;batch:ChipPresentationBatch|null};
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number};
}
export function golfCard(value:number|null):Card|undefined {
 if(value===null||!Number.isInteger(value)||value<0||value>51)return undefined;
 return {rank:['A','2','3','4','5','6','7','8','9','10','J','Q','K'][value%13] as Rank,suit:['♠','♥','♦','♣'][Math.floor(value/13)] as Suit};
}
export function golfSnapshot(raw:unknown):GolfSnapshot {
 const v=raw as GolfSnapshot;
 if(!v?.identity?.dealerGameId||v.rules?.version!=='six-card-golf/1'||!Array.isArray(v.players)||v.players.length<2||v.players.length>4)throw Error('Golf snapshot identity mismatch');
 for(const p of v.players) {
  const board=v.tableaus?.[p.id];
  if(!board||board.cards.length!==6||board.exposed.length!==6||board.cards.some((c,i)=>!board.exposed[i]&&c!==null))throw Error('Golf projection rejected');
 }
 if(v.pending&&v.pending.actor!==v.viewerId)throw Error('Golf projection rejected');
 return {...v,id:v.identity.dealerGameId,scope:v.identity.roundId,settled:v.settlement!==null,
  players:v.players.map(p=>({...p,chips:v.financial?.balances[p.id]??p.chips}))};
}
export function acceptGolfSnapshot(old:GolfSnapshot|null,next:GolfSnapshot,id:string) {
 if(next.id!==id||!Number.isSafeInteger(next.revision))throw Error('Golf snapshot identity mismatch');
 if(old&&next.revision<old.revision)return old;
 const semantic=(v:GolfSnapshot)=>JSON.stringify({...v,serverAt:0,financial:undefined,receipt:undefined,players:v.players.map(({chips,...p})=>p)});
 if(old&&next.revision===old.revision&&semantic(old)!==semantic(next))throw Error('Golf conflicting snapshot');
 return next;
}
export function golfPlayWindow(v:GolfSnapshot,at:number) {return {playable:(v.phase==='opening'||v.phase==='playing')&&at<v.deadline};}
export function golfWarning(v:GolfSnapshot) {
 if(v.finalReason)return 'Final turns: '+v.finalQueue.length+' remaining';
 const left=5*v.players.length-v.consecutiveNoRevealTurns;
 return v.consecutiveNoRevealTurns>=4*v.players.length?'Ptown house rule: final turns in '+left+' completed turn'+(left===1?'':'s')+' without a new reveal.':null;
}
