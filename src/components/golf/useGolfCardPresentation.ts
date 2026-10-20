import {useLayoutEffect,useRef,useState} from 'react';
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
export function useGolfCardPresentation(v:GolfSnapshot|null,epoch:number,userId:string){
 const {dispatch}=useCardTransport(),prior=useRef<{v:GolfSnapshot;epoch:number}|null>(null),tokens=useRef(new Map<string,string>()),[hidden,setHidden]=useState<Map<string,number[]>>(new Map());
 useLayoutEffect(()=>{
  if(!v)return;
  const old=prior.current;prior.current={v,epoch};
  if(!old||old.epoch!==epoch||document.hidden){tokens.current.clear();setHidden(new Map());return;}
  const intents=golfFlights(old.v,v,userId);if(!intents.length)return;
  const active=new Map<string,number[]>();
  for(const intent of intents){if(intent.to.kind!=='tableau')continue;const {playerId,index}=intent.to;
   const key=playerId+':'+index;tokens.current.set(key,intent.id);
   if(dispatch(intent,{onSettled:()=>{if(tokens.current.get(key)!==intent.id)return;tokens.current.delete(key);setHidden(previous=>{const next=new Map(previous);next.set(playerId,(next.get(playerId)??[]).filter(i=>i!==index));return next;});}}))active.set(playerId,[...(active.get(playerId)??[]),index]);
  }
  setHidden(active);
 },[v,epoch,userId,dispatch]);
 return hidden;
}
