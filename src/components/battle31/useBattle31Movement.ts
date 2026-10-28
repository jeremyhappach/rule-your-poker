import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useCardTransport} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import type {CardEndpoint,CardTransportIntent} from '@/lib/canonicalShell/cardTransport/types';
import type {Battle31Move,Battle31Snapshot} from '@/lib/battle31/model';
import {battleCard} from '@/lib/battle31/presentation';
type Job={key:string;v:Battle31Snapshot;move?:Battle31Move;deal?:boolean};
export function battleFlights(job:Job,userId:string,context:string):CardTransportIntent[]{
 const {v,move}=job,flights:CardTransportIntent[]=[];
 const hand=(actor:number,index:number):CardEndpoint=>v.players[actor].id===v.viewerId?{kind:'tableau',playerId:v.viewerId,index}:{kind:'oppStack',position:v.players[actor].seat};
 const add=(id:string,from:CardEndpoint,to:CardEndpoint,card:number|null,delay=0)=>{const face=battleCard(card);flights.push({id:context+':'+id,cardId:context+':'+id,handContextId:context,from,to,face:face?'visible':'hidden',...(face?{visibleFace:{rank:face.rank,suit:['clubs','diamonds','hearts','spades'][Math.floor(card!/8)] as 'clubs'}}:{}),durationMs:280,launchDelayMs:delay,ownershipClaimDelayMs:0,soundUserId:userId});};
 if(job.deal){const dealer=v.players[v.board.dealerIndex??0],from:CardEndpoint=dealer.id===v.viewerId?{kind:'feltDealOrigin'}:{kind:'oppStack',position:dealer.seat};
  for(let i=0;i<3;i++){for(let a=0;a<2;a++)add('deal:'+a+':'+i,from,hand(a,i),v.players[a].id===v.viewerId?v.board.hands[a][i]:null,(i*2+a)*70);add('deal:center:'+i,from,{kind:'community',index:i},v.board.center[i],(6+i)*70);}
 }else if(move){for(const pair of move.pairs){add(move.id+':out:'+pair.handIndex,hand(move.actor,pair.handIndex),{kind:'community',index:pair.centerIndex},pair.out);add(move.id+':in:'+pair.handIndex,{kind:'community',index:pair.centerIndex},hand(move.actor,pair.handIndex),v.players[move.actor].id===v.viewerId?pair.in:null);}}
 return flights;
}
export function useBattle31Movement(v:Battle31Snapshot|null,epoch:number,userId:string,liveEntry:boolean){
 const {dispatch,cancelHand}=useCardTransport(),prior=useRef<{v:Battle31Snapshot;epoch:number}|null>(null),[queue,setQueue]=useState<Job[]>([]);
 const [landed,setLanded]=useState<{key:string;ids:Set<string>}>({key:'',ids:new Set()});
 const context=v?'battle31:'+v.id+':'+epoch+':'+v.scope:'battle31:none';
 const contextRef=useRef(context);contextRef.current=context;
 useEffect(()=>()=>cancelHand(context,'battle31 identity retired'),[context,cancelHand]);
 useLayoutEffect(()=>{if(!v){prior.current=null;setQueue([]);return;}const old=prior.current;prior.current={v,epoch};
  if(document.hidden||v.paused||old&&old.epoch!==epoch){cancelHand(context,'battle31 seek');setQueue([]);return;}
  if(!old||old.v.scope!==v.scope){setQueue((old||liveEntry)&&v.board.phase==='intro'&&v.serverAt-(v.board.dealStartedAt??v.serverAt)<500?[{key:context+':deal',v,deal:true}]:[]);return;}
  const seen=new Set(old.v.board.moves?.map(m=>m.id));const added=(v.board.moves??[]).filter(m=>!seen.has(m.id));
  if(added.length)setQueue(q=>[...q,...added.map(move=>({key:context+':'+move.id,v,move}))]);
 },[v,epoch,context,liveEntry,cancelHand]);
 useEffect(()=>{const seek=()=>{if(document.hidden){cancelHand(context,'battle31 background seek');setQueue([]);}};document.addEventListener('visibilitychange',seek);return()=>document.removeEventListener('visibilitychange',seek);},[context,cancelHand]);
 const active=queue[0]?.v.scope===v?.scope&&queue[0]?.key.startsWith(context+':')?queue[0]:undefined;
 useEffect(()=>{if(!active)return;const intents=battleFlights(active,userId,context),finished=new Set<string>();let remaining=intents.length;
  const done=(intent:CardTransportIntent)=>{if(finished.has(intent.id)||contextRef.current!==context)return;finished.add(intent.id);
   if(active.deal)setLanded(old=>({key:active.key,ids:new Set([...(old.key===active.key?old.ids:[]),intent.id])}));
   if(--remaining<=0)setQueue(q=>q[0]?.key===active.key?q.slice(1):q);
  };
  for(const intent of intents)if(!dispatch(intent,{onSettled:()=>done(intent)}))done(intent);
 },[active?.key,dispatch,context,userId]);
 const hands=v?.board.hands.map(h=>[...h])??[],center=[...(v?.board.center??[])];
 for(const job of [...queue].reverse())if(job.v.scope===v?.scope&&job.move)for(const pair of job.move.pairs){center[pair.centerIndex]=pair.in;if(v.players[job.move.actor].id===v.viewerId)hands[job.move.actor][pair.handIndex]=pair.out;}
 return {hands,center,busy:!!active,hidden:(actor:number|null,index:number)=>!!active&&(active.deal
  ?!(landed.key===active.key&&landed.ids.has(context+':deal:'+(actor===null?'center':actor)+':'+index))
  :!!active.move?.pairs.some(p=>actor===null?p.centerIndex===index:v?.players[active.move!.actor].id===v?.players[actor].id&&p.handIndex===index))};
}
