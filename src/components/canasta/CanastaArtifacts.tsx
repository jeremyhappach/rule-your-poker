import {useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Snapshot} from '@/lib/canasta/client';
import {CanonicalSeatCluster} from '@/lib/canonicalShell/CanonicalSeatCluster';
import {useSeatAnchors} from '@/lib/canonicalShell/SeatAnchorLayer';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {PlayingCard} from '@/components/PlayingCard';
import {AutoRollIndicator} from '@/components/AutoRollIndicator';
import {isResolvedJoker} from '@/lib/cardGames/physicalCard';
import {pileStatus} from '@/lib/canasta/rules';
import {safeFeltRect,type Rect} from '@/lib/run21/safeFelt';
import {useCardTransportInternal} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
export type CanastaPlayer={id:string;user_id:string;position:number;chips:number;profiles?:{username:string}};
/** Uses the accepted checkpoint geometry and the shell's existing interaction layer. */
export function CanastaArtifacts({snapshot,players,ended}:{snapshot:Snapshot|null;players:CanastaPlayer[];ended:boolean}){
 const anchors=useSeatAnchors(),layer=useCanonicalFeltInteractionLayerElement(true),[area,setArea]=useState<Rect>({x:.5,y:.5,width:0,height:0});
 useLayoutEffect(()=>{
  if(!layer)return;const root=layer.closest('[data-canonical-shell-root]');if(!root)return;
  const nodes=[...root.querySelectorAll<HTMLElement>('[data-canonical-felt-plate], [data-canonical-seat-cluster]')].filter(n=>!n.closest('[data-canonical-shell-viewer-chip-endpoint]'));
  const measure=()=>{const f=layer.getBoundingClientRect();if(!f.width||!f.height)return;
   const reserved=nodes.map(n=>n.getBoundingClientRect()).map(r=>({x:(r.x-f.x)/f.width,y:(r.y-f.y)/f.height,width:r.width/f.width,height:r.height/f.height}));
   const next=safeFeltRect(reserved,f.width/f.height);setArea(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};
  const ro=new ResizeObserver(measure);ro.observe(layer);nodes.forEach(n=>ro.observe(n));measure();return()=>ro.disconnect();
 },[layer,snapshot?.state.seats.length]);
 const s=snapshot?.state,h=s?.hand,top=h?.pile.at(-1),viewer=s?.viewer;
 const flights=useCardTransportInternal()?.__activeIntents??[];
 const blocked=h?pileStatus(h.pile,!!(viewer&&h.players[viewer]?.opened)):null;
 return <>
  <div className="canasta-play"><div className="canasta-seats">{s?.seats.filter(p=>p.id!==viewer).map(seat=>{
   const p=players.find(p=>p.id===seat.id),slot=anchors.byPosition.get(seat.seat)?.slot;return <CanonicalSeatCluster key={seat.id} slot={slot} position={seat.seat} name={p?.profiles?.username??'Opponent'} chipValue={String(p?.chips??0)} chipAmount={p?.chips??0} playerId={seat.id} ownerLabel="Canasta" scoreLine={String(s.totals[seat.id])} chipDiscChildren={!ended&&seat.kind==='human'&&s.automatic.includes(seat.id)?<span role="img" aria-label="Opponent auto-play"><AutoRollIndicator isRightSide={(slot??0)>=3}/></span>:null}>
    {!ended&&h&&<span data-card-anchor={`opp-stack-${seat.seat}`} className="text-xs">{h.players[seat.id].count} cards · {h.players[seat.id].melds.map(m=>`${m.rank} × ${m.cards.length}`).join(' · ')}</span>}
   </CanonicalSeatCluster>;
  })}</div></div>
  {!ended&&h&&layer&&area.width*layer.clientWidth>=130&&area.height*layer.clientHeight>=88&&createPortal(<div className="canasta-felt" style={{left:`${area.x*100}%`,top:`${area.y*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}}>
   {!snapshot?.settlement&&<div className="canasta-piles"><div data-card-anchor="stock">{h.stockCount?<PlayingCard isHidden style={{width:48,height:68}}/>:<span className="canasta-empty">Empty</span>}<small>Stock · {h.stockCount}</small></div>
    <div data-card-anchor="discard" className="canasta-pile-stack">{h.freezeIndicator&&h.pileFrozen&&<span className="canasta-freeze-marker" aria-label="Wild card freezes the pile">Wild</span>}{top?<PlayingCard card={isResolvedJoker(top.face)?undefined:top.face} jokerFace={isResolvedJoker(top.face)?top.face:undefined} physicalId={top.id} style={{width:48,height:68,visibility:flights.some(f=>f.cardId===top.id)?'hidden':undefined}}/>:<span className="canasta-empty">Empty</span>}<small>{h.pileCount} · {blocked?.blocked?'Blocked':h.pileFrozen||blocked?.personalFreeze?'Frozen':'Pile'}</small></div></div>}
  </div>,layer)}
  {!ended&&snapshot?.settlement&&layer&&createPortal(<div className="canasta-felt text-white text-center text-sm" style={{left:`${area.x*100}%`,top:`${area.y*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}}><div>{s!.seats.map(seat=><p key={seat.id}>{players.find(p=>p.id===seat.id)?.profiles?.username??'Player'} · {s!.totals[seat.id]}{seat.id===s!.winner?' · Winner':''}</p>)}</div></div>,layer)}
 </>;
}
