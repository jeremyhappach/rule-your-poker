import {acceptWordsSnapshot,type WordsSnapshot} from '@/lib/ptownWords/model';
import type {ReviewEvent} from './reviews';

/** One terminal board review covers prior Words receipts, without replaying them. */
export function wordsFinalReview(events:ReviewEvent[],snapshot:WordsSnapshot,childId:string,matchId:string,userId:string){
 acceptWordsSnapshot(null,snapshot,childId);
 if(snapshot.identity.sessionId!==matchId||snapshot.viewerId!==userId||!snapshot.finished||snapshot.phase!=='complete')throw Error('Invalid completed Words review.');
 const final=events.find(e=>e.kind==='child');
 if(!final)throw Error('Missing completed Words result.');
 const move=snapshot.moves.at(-1),presentation=snapshot.movePresentation;
 const attempt=final.receipt.reason!=='timeout_forfeit'&&move?.turn===snapshot.turn-1&&move?.playerId!==userId&&move?.action==='place'&&presentation?.turn===move.turn&&presentation.playerId===move.playerId
  ?events.find(e=>e.kind==='attempt'&&e.actor===move.playerId&&e.round===move.turn):undefined;
 // Own finishes, passes, forfeits and legacy results show the final board, never
 // the last earlier placement. The server snapshot owns all adjusted totals.
 const event:ReviewEvent={...(attempt??final),score:attempt?move!.points:0,
  receipt:{...(attempt??final).receipt,game:'ptown-words',move:attempt?move:undefined},
  board:{...snapshot,moves:attempt?[move!]:[],movePresentation:attempt?presentation:undefined}};
 return {event,acknowledge:events.filter(e=>e.kind==='attempt'&&e.actor!==userId&&!e.seen).map(e=>e.id)};
}
