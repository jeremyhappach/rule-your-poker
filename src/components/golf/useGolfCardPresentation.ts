import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useCardTransport} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import type {CardTransportIntent} from '@/lib/canonicalShell/cardTransport/types';
import {golfCard,type GolfSnapshot} from '@/lib/golf/model';

/** Public projection differences only. A fresh mount/reconnect seeks, never replays. */
export function golfFlights(before:GolfSnapshot,after:GolfSnapshot,userId:string):CardTransportIntent[]{
 if(after.revision<=before.revision||after.paused||after.id!==before.id)return [];
 const result:CardTransportIntent[]=[];
 const add=(playerId:string,index:number,card:number|null,from:CardTransportIntent['from'])=>{
  const value=golfCard(card),id=['golf',after.scope,after.revision,playerId,index].join(':');
  result.push({id,cardId:id,handContextId:after.scope,recipientPlayerId:playerId,from,to:{kind:'tableau',playerId,index},face:value?'visible':'hidden',
   ...(value?{visibleFace:{rank:value.rank,suit:({'♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs'} as const)[value.suit]}}:{}),durationMs:110,ownershipClaimDelayMs:0,soundUserId:userId});
 };
 for(const p of after.players)for(let i=0;i<6;i++){
  const next=after.tableaus[p.id].cards[i],old=before.tableaus[p.id]?.cards[i];
  if(after.scope!==before.scope)add(p.id,i,next,{kind:'feltDealOrigin'});
  else if(next!==old)add(p.id,i,next,before.pending?.actor===p.id?{kind:'tableau',playerId:p.id,index:6}:before.phase==='opening'||after.phase!=='playing'?{kind:'tableau',playerId:p.id,index:i}:{kind:'discard'});
 }
 // The shell's diagnostic transport stream never receives a private rank/suit.
 if(after.pending&&after.pending.card!==before.pending?.card)add(after.pending.actor,6,null,{kind:'stock'});
 return result;
}
export interface GolfMove {key:string;before:GolfSnapshot;after:GolfSnapshot;actor:string;index:number;stage:'draw'|'incoming'|'outgoing'|'flip'}
export function golfMove(before:GolfSnapshot,after:GolfSnapshot):GolfMove|null {
 if(before.id!==after.id||before.scope!==after.scope||after.revision!==before.revision+1||after.paused||before.phase!=='playing'||after.phase!=='playing')return null;
 const actor=before.players[before.turnIndex].id,key=after.scope+':'+after.revision;
 if(after.pending&&!before.hasPending)return {key,before,after,actor,index:6,stage:'draw'};
 const changed=after.tableaus[actor].cards.flatMap((c,i)=>c!==before.tableaus[actor].cards[i]?[i]:[]);
 if(changed.length===1)return {key,before,after,actor,index:changed[0],stage:'incoming'};
 return null;
}
/** Retain occupied destinations and source anchors until real transport retirement.
 * Recovery/new identities seek the current snapshot; they never wait for a peer. */
export function useGolfCardPresentation(v:GolfSnapshot|null,epoch:number,userId:string){
 const {dispatch}=useCardTransport(),prior=useRef<{v:GolfSnapshot;epoch:number}|null>(null);
 const [move,setMove]=useState<GolfMove|null>(null);
 useLayoutEffect(()=>{
  if(!v)return;const old=prior.current;prior.current={v,epoch};
  if(!old||old.epoch!==epoch||old.v.scope!==v.scope||document.hidden){setMove(null);return;}
  if(v.revision===old.v.revision)return;
  setMove(golfMove(old.v,v));
 },[v,epoch]);
 const active=move&&v&&move.after.scope===v.scope&&move.after.revision===v.revision?move:null;
 useEffect(()=>{
  if(!active||active.stage==='flip')return;
  const {actor,index,stage,before,after,key}=active;
  const destination={kind:'tableau' as const,playerId:actor,index};
  const from=stage==='draw'?{kind:'stock' as const}:stage==='outgoing'?{kind:'tableau' as const,playerId:actor,index:7}:
   before.hasPending?(before.pending?{kind:'tableau' as const,playerId:actor,index:6}:{kind:'stock' as const}):{kind:'discard' as const};
  const card=stage==='incoming'?golfCard(after.tableaus[actor].cards[index]):stage==='outgoing'?golfCard(before.tableaus[actor].cards[index]):undefined;
  const id='golf-move:'+key+':'+stage;
  const finish=()=>setMove(current=>current?.key===key&&current.stage===stage?
   stage==='incoming'?{...current,stage:'outgoing'}:stage==='outgoing'&&before.tableaus[actor].cards[index]===null?{...current,stage:'flip'}:null:current);
  if(!dispatch({id,cardId:id,handContextId:after.scope,recipientPlayerId:actor,from,
   to:stage==='outgoing'?{kind:'discard'}:destination,face:card?'visible':'hidden',
   ...(card?{visibleFace:{rank:card.rank,suit:({'♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs'} as const)[card.suit]}}:{}),
   durationMs:180,ownershipClaimDelayMs:0,soundUserId:userId},{onSettled:finish}))finish();
 },[active?.key,active?.stage,dispatch,userId]);
 return {move:active,busy:!!active,finishFlip:()=>setMove(current=>current?.stage==='flip'?null:current),
  card:(player:string,index:number)=>active?.stage==='incoming'&&active.actor===player&&active.index===index?active.before.tableaus[player].cards[index]:v?.tableaus[player].cards[index]??null,
  pending:active?.stage==='incoming'?active.before.pending:v?.pending,
  pendingBack:active?.stage==='draw',
  discard:active&&active.stage!=='draw'?active.before.discardTop:v?.discardTop??null};
}
