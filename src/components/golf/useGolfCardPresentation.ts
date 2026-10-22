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
export interface GolfMove {key:string;before:GolfSnapshot;after:GolfSnapshot;actor:string;index:number;stock:boolean;bundled:boolean;stage:'select'|'draw'|'drawn'|'incoming'|'landed'|'outgoing'|'reject'|'flip'|'arrived'}
export function golfMove(before:GolfSnapshot,after:GolfSnapshot):GolfMove|null {
 if(before.id!==after.id||before.scope!==after.scope||after.revision<=before.revision||after.paused||before.phase!=='playing')return null;
 const actor=before.players[before.turnIndex].id,key=after.scope+':'+after.revision;
 const adjacent=after.revision===before.revision+1;
 if(adjacent&&after.hasPending&&!before.hasPending)return {key,before,after,actor,index:6,stock:true,bundled:false,stage:'draw'};
 // At final reveal, only positions already exposed before scoring can identify
 // the last replacement. Never animate the other newly public cards as moves.
 const hidden=after.phase==='playing'?[]:after.presentation?.hidden[actor];
 if(!hidden)return null;
 const changed=after.tableaus[actor].cards.flatMap((c,i)=>!hidden.includes(i)&&c!==before.tableaus[actor].cards[i]?[i]:[]);
 // Realtime may coalesce exactly draw + replace/reject. A changed stock count
 // and exactly two revisions distinguish this from a discard pickup.
 const bundled=!before.hasPending&&!after.hasPending&&after.revision===before.revision+2&&before.stockCount!==after.stockCount;
 if(!adjacent&&!bundled)return null;
 if(changed.length===1)return {key,before,after,actor,index:changed[0],stock:before.hasPending||bundled,bundled,stage:bundled?'draw':'select'};
 if((before.hasPending||bundled)&&!after.hasPending)return {key,before,after,actor,index:6,stock:true,bundled,stage:bundled?'draw':'reject'};
 return null;
}
/** Retain occupied destinations and source anchors until real transport retirement.
 * Recovery/new identities seek the current snapshot; they never wait for a peer. */
export function useGolfCardPresentation(v:GolfSnapshot|null,epoch:number,userId:string){
 const {dispatch}=useCardTransport(),prior=useRef<{v:GolfSnapshot;epoch:number}|null>(null);
 const [queue,setQueue]=useState<GolfMove[]>([]);
 useLayoutEffect(()=>{
  if(!v){prior.current=null;setQueue([]);return;}const old=prior.current;prior.current={v,epoch};
  if(!old||old.epoch!==epoch||old.v.id!==v.id||old.v.scope!==v.scope||v.paused||document.hidden){setQueue([]);return;}
  if(v.revision===old.v.revision)return;
  const next=golfMove(old.v,v);
  if(next)setQueue(current=>[...current,{...next,key:epoch+':'+next.key}]);
  else if(v.revision!==old.v.revision+1)setQueue([]);
 },[v,epoch]);
 const active=queue[0]&&v&&queue[0].after.scope===v.scope&&!v.paused?queue[0]:null;
 const finish=(key:string,stage:GolfMove['stage'],next?:GolfMove['stage'])=>setQueue(current=>current[0]?.key===key&&current[0].stage===stage?(next?[{...current[0],stage:next},...current.slice(1)]:current.slice(1)):current);
 useEffect(()=>{
  if(!active||active.stage==='flip')return;
  const {actor,index,stage,before,after,key,stock,bundled}=active;
  if(stage==='arrived'||stage==='landed'){
   // The shell retires a settled flight on its next render. Keep both physical
   // cards represented while that ownership handoff paints before launching.
   let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>finish(key,stage,stage==='landed'?'outgoing':undefined));});
   return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  }
  if(stage==='select'||stage==='drawn'){
   const timer=setTimeout(()=>finish(key,stage,stage==='select'?'incoming':bundled?(index===6?'reject':'incoming'):undefined),180);
   return()=>clearTimeout(timer);
  }
  const destination={kind:'tableau' as const,playerId:actor,index:stage==='draw'?6:index};
  const from=stage==='draw'?{kind:'stock' as const}:stage==='outgoing'?{kind:'tableau' as const,playerId:actor,index:7}:
   stock?{kind:'tableau' as const,playerId:actor,index:6}:{kind:'discard' as const};
  const card=stage==='incoming'?golfCard(after.tableaus[actor].cards[index]):stage==='outgoing'?golfCard(before.tableaus[actor].cards[index]):stage==='reject'&&before.pending?golfCard(before.pending.card):undefined;
  const id='golf-move:'+key+':'+stage;
  const settled=()=>finish(key,stage,stage==='draw'?'drawn':stage==='incoming'?'landed':(stage==='outgoing'&&before.tableaus[actor].cards[index]===null||stage==='reject'&&!before.pending)?'flip':'arrived');
  if(!dispatch({id,cardId:id,handContextId:after.scope,recipientPlayerId:actor,from,
   to:stage==='outgoing'||stage==='reject'?{kind:'discard'}:destination,face:card?'visible':'hidden',
   ...(card?{visibleFace:{rank:card.rank,suit:({'♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs'} as const)[card.suit]}}:{}),
   durationMs:350,ownershipClaimDelayMs:0,soundUserId:userId},{onSettled:settled}))settled();
 },[active?.key,active?.stage,dispatch,userId]);
 const pendingActor=active?(active.stock&&['draw','drawn','select','incoming','reject'].includes(active.stage)?active.actor:null):v?.hasPending?v.players[v.turnIndex].id:null;
 const pending=active?(pendingActor?(active.stage==='draw'||active.stage==='drawn'?active.after.pending:active.before.pending):null):v?.pending;
 return {move:active,busy:!!active,finishFlip:()=>{if(active)finish(active.key,'flip');},
  card:(player:string,index:number)=>active?(active.actor===player&&active.index===index&&['landed','outgoing','flip','arrived'].includes(active.stage)?active.after.tableaus[player].cards[index]:active.before.tableaus[player].cards[index]):v?.tableaus[player].cards[index]??null,
  pending,pendingActor,pendingBack:active?.stage==='draw'||!!pendingActor&&!pending,
  discard:active?(active.stage==='arrived'?active.after.discardTop:active.before.discardTop):v?.discardTop??null};
}
