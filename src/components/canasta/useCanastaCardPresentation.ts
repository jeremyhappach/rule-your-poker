import {useLayoutEffect,useRef} from 'react';
import type {Snapshot} from '@/lib/canasta/client';
import {useCardTransport} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import type {CardEndpoint} from '@/lib/canonicalShell/cardTransport/types';
import {isResolvedJoker,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {resolveTransportCardFace} from '@/lib/cardGames/resolvedCardFace';
import {platformAudio} from '@/lib/audio/platformAudio';
import {cardSwooshCueAt} from '@/lib/audio/cardSwoosh';
/** Animate only adjacent observed commits. Reconnect baselines never replay old actions. */
export function useCanastaCardPresentation(snapshot:Snapshot|null,userId:string){
 const prior=useRef<Snapshot|null>(null),transport=useCardTransport(),dispatch=useRef(transport.dispatch);dispatch.current=transport.dispatch;
 useLayoutEffect(()=>{
  if(!snapshot)return;const old=prior.current;prior.current=snapshot;
  const h=snapshot.state.hand,before=old?.state.hand,viewer=snapshot.state.viewer;
  if(!old||!h||!before||h.id!==before.id||snapshot.state.revision!==old.state.revision+1||!viewer||snapshot.finished)return;
  const emit=(card:PhysicalCard,from:CardEndpoint,to:CardEndpoint,stackCount?:number)=>{
   const id=`canasta:${h.id}:${snapshot.state.revision}:${card.id}`;
   const accepted=dispatch.current({id,cardId:card.id,handContextId:h.id,face:'visible',from,to,stackCount,durationMs:300,
    ...(isResolvedJoker(card.face)?{jokerFace:card.face}:{visibleFace:resolveTransportCardFace(card.face)!})});
   if(accepted){const at=performance.now();platformAudio.follow({userId,id:`swoosh:${id}`,startedAt:at,expiresAt:at+100,cueAt:cardSwooshCueAt});}
  };
  const was=before.players[viewer].cards??[],cards=h.players[viewer].cards??[];
  if(before.phase==='draw'&&h.source==='pile'&&h.pileCount===0&&before.pileCount>0){
   const top=before.pile.at(-1),seat=snapshot.state.seats.find(s=>s.id===before.active);
   if(top&&seat)emit(top,{kind:'discard'},before.active===viewer?{kind:'hand',playerId:viewer}:{kind:'oppStack',position:seat.seat},before.pileCount);
  }else if(before.active===viewer&&before.phase==='draw')for(const card of cards)if(!was.some(c=>c.id===card.id))emit(card,{kind:'stock'},{kind:'hand',playerId:viewer});
  const top=h.pile.at(-1);if(top&&!before.pile.some(c=>c.id===top.id)){
   const seat=snapshot.state.seats.find(s=>s.id===before.active);
   if(seat)emit(top,before.active===viewer?{kind:'hand',playerId:viewer}:{kind:'oppStack',position:seat.seat},{kind:'discard'});
  }
 },[snapshot,userId]);
}
