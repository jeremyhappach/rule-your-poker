import type {Card} from '@/lib/cardUtils';
import type {Battle31Snapshot} from './model';
export function battleCard(id:number|null|undefined):Card|undefined {
 if(id==null||!Number.isInteger(id)||id<0||id>31)return undefined;
 return {rank:['7','8','9','10','J','Q','K','A'][id%8],suit:['♣','♦','♥','♠'][Math.floor(id/8)]} as Card;
}
export function battleFrame(v:Battle31Snapshot,now:number){
 const b=v.board,p=b.presentation,at=v.paused?v.pausedAt??now:now;
 const result=!!b.result&&['round_result','complete'].includes(b.phase);
 return {at,result,reveal:result&&(!p||at>=p.revealAt),announce:result&&(!p||at>=p.announceAt),life:result&&(!p||at>=p.lifeAt),clear:result&&!v.settled&&!!p&&at>=p.clearAt,
  winner:!!v.settled&&(!v.terminal||at>=v.terminal.startedAt),dealer:b.dealerIndex??(v.round%2),movingDealer:result&&!v.settled&&!!p&&at>=p.clearAt&&at<p.clearAt+650};
}
export function battleProgress(v:Battle31Snapshot){
 return 'Round '+Math.min(4,Math.max(1,Math.ceil(v.board.turn/2)))+'/4';
}
/** Includes the current uncompleted deal; a committed result consumes that deal. */
export function battleRoundsRemaining(v:Battle31Snapshot){return v.settled||v.board.phase==='complete'?0:Math.max(0,12-v.round+(v.board.phase==='intro'||v.board.phase==='playing'?1:0));}
export function battleResultText(v:Battle31Snapshot){const r=v.board.result;if(!r)return v.board.event.label;
 return r.loser===null?'Round tied '+r.values[0]+'–'+r.values[1]:v.players[1-r.loser].name+' wins '+r.values[1-r.loser]+'–'+r.values[r.loser];}
