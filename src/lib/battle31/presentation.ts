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
 const b=v.board,actor=v.players.find(p=>p.active)?.name??'Player';
 if(b.phase==='intro')return 'Dealing round '+v.round;
 if(b.phase!=='playing')return 'Round '+v.round+' result';
 if(b.closing)return actor+' · final response to '+(b.knock?v.players[b.knock.actor].name+'’s knock':'the knock');
 if(b.turn>=7)return 'Final turns · '+actor+(b.turn===7?' then '+v.players.find(p=>!p.active)?.name:' has the last decision');
 return 'Decision '+b.turn+'/8 · automatic final turns after decision 6';
}
export function battleResultText(v:Battle31Snapshot){const r=v.board.result;if(!r)return v.board.event.label;
 return r.loser===null?'Round tied '+r.values[0]+'–'+r.values[1]:v.players[1-r.loser].name+' wins '+r.values[1-r.loser]+'–'+r.values[r.loser];}
