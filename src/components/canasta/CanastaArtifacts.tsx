import {useEffect,useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Snapshot} from '@/lib/canasta/client';
import {CanonicalSeatCluster} from '@/lib/canonicalShell/CanonicalSeatCluster';
import {useSeatAnchors} from '@/lib/canonicalShell/SeatAnchorLayer';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {AutoRollIndicator} from '@/components/AutoRollIndicator';
import {isResolvedJoker} from '@/lib/cardGames/physicalCard';
import {PlayingCard} from '@/components/PlayingCard';
import {canastaLabel,orderedMeldRanks} from './presentation';
import {wild} from '@/lib/canasta/rules';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {CardFan} from './CardFan';
import {canastaFeltRects,useCanastaGeometry} from './geometry';
import {safeFeltRect} from '@/lib/run21/safeFelt';
export type CanastaPlayer={id:string;user_id:string;position:number;chips:number;profiles?:{username:string}};
/** Uses the accepted checkpoint geometry and the shell's existing interaction layer. */
export function CanastaArtifacts({snapshot,players,ended,onPileTarget}:{snapshot:Snapshot|null;players:CanastaPlayer[];ended:boolean;onPileTarget?:(node:HTMLDivElement|null)=>void}){
 const anchors=useSeatAnchors(),layer=useCanonicalFeltInteractionLayerElement(true),geometry=useCanastaGeometry(),[area,setArea]=useState(()=>({...canastaFeltRects([],0,0,geometry),terminal:{x:.5,y:.5,width:0,height:0}}));
 const [inspect,setInspect]=useState<{seat:string;rank:string}|null>(null);
 useEffect(()=>setInspect(null),[snapshot?.state.hand?.id,snapshot?.state.hand?.phase==='complete',snapshot?.settlement?.resultId,ended]);
 useLayoutEffect(()=>{
  if(!layer)return;const root=layer.closest('[data-canonical-shell-root]');if(!root)return;
  const nodes=[...root.querySelectorAll<HTMLElement>('[data-canonical-felt-plate], [data-canonical-seat-cluster], [data-canonical-seat-cluster] span, [data-card-anchor^="opp-stack-"]')].filter(n=>!n.closest('[data-canonical-shell-viewer-chip-endpoint]'));
  const measure=()=>{const f=layer.getBoundingClientRect();if(!f.width||!f.height)return;
   const reserved=nodes.map(n=>n.getBoundingClientRect()).map(r=>({x:(r.x-f.x)/f.width,y:(r.y-f.y)/f.height,width:r.width/f.width,height:r.height/f.height}));
   const next={...canastaFeltRects(reserved,f.width,f.height,geometry),terminal:safeFeltRect(reserved,f.width/f.height)};setArea(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};
  const ro=new ResizeObserver(measure);ro.observe(layer);nodes.forEach(n=>ro.observe(n));measure();return()=>ro.disconnect();
 },[layer,snapshot?.state.seats.length,geometry]);
 const s=snapshot?.state,h=s?.hand,viewer=s?.viewer,top=h?.pile.at(-1);
 const pileWidth=Math.max(28,Math.min(44,(area.piles.height*(layer?.clientHeight??0)-20)*44/62)),pileCardStyle={width:pileWidth,height:Math.round(pileWidth*62/44)};
 const inspected=inspect&&h?.players[inspect.seat]?.melds.find(m=>m.rank===inspect.rank);
 const rectStyle=(r:typeof area.summary)=>({position:'absolute' as const,left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.width*100}%`,height:`${r.height*100}%`});
 return <>
  <div className="canasta-play"><div className="canasta-seats">{s?.seats.filter(p=>p.id!==viewer).map(seat=>{
   const p=players.find(p=>p.id===seat.id),slot=anchors.byPosition.get(seat.seat)?.slot;return <CanonicalSeatCluster key={seat.id} slot={slot} position={seat.seat} name={p?.profiles?.username??'Opponent'} chipValue={String(p?.chips??0)} chipAmount={p?.chips??0} playerId={seat.id} ownerLabel="Canasta" scoreLine={ended?undefined:String(s.totals[seat.id])} chipDiscChildren={!ended&&seat.kind==='human'&&s.automatic.includes(seat.id)?<span role="img" aria-label="Opponent auto-play"><AutoRollIndicator isRightSide={(slot??0)>=3}/></span>:null}>
    {!ended&&h&&<span data-card-anchor={`opp-stack-${seat.seat}`} className="text-xs">{h.players[seat.id].count} cards</span>}
   </CanonicalSeatCluster>;
  })}</div></div>
  {!ended&&h&&layer&&createPortal(<>
   {!snapshot?.settlement&&<>
    {area.summary.width>0&&<div className="canasta-meld-summary" aria-label="Opponent meld summary" style={rectStyle(area.summary)}>{s!.seats.filter(seat=>seat.id!==viewer).flatMap(seat=>orderedMeldRanks(h.players[seat.id].melds).map(rank=>{
      const m=h.players[seat.id].melds.find(m=>m.rank===rank)!,wilds=m.cards.filter(wild).length,complete=!!canastaLabel(m);
      return <button key={seat.id+rank} data-summary-rank={rank} data-complete={complete} aria-label={`${m.cards.length} cards of rank ${rank}, ${wilds?wilds+' wild cards':'natural'}, ${complete?'complete canasta':'incomplete meld'}. Inspect cards`} onClick={()=>setInspect({seat:seat.id,rank})}>
        <b>{m.cards.length} × {rank}</b><span className="canasta-summary-badge" title={wilds?'Wild cards':'Natural'}>{wilds?'W'+wilds:'N'}</span>{complete&&<span className="canasta-summary-badge" title="Complete canasta">C</span>}
      </button>;
    }))}</div>}
    {area.piles.width>0&&<div ref={onPileTarget} className="canasta-piles" style={{...rectStyle(area.piles),gap:44*geometry.pileGap}}>{!viewer&&<>
      <div data-card-anchor="discard">{top?<PlayingCard card={isResolvedJoker(top.face)?undefined:top.face} jokerFace={isResolvedJoker(top.face)?top.face:undefined} style={pileCardStyle}/>:<span className="canasta-empty" style={pileCardStyle}>Empty</span>}<small>Pile {h.pileCount}{h.pileFrozen?' ❄':''}</small></div>
      <div data-card-anchor="stock">{h.stockCount?<PlayingCard isHidden style={pileCardStyle}/>:<span className="canasta-empty" style={pileCardStyle}>Empty</span>}<small>Stock {h.stockCount}</small></div>
    </>}</div>}
   </>}
  </>,layer)}
  <Dialog open={!!inspected&&!ended} onOpenChange={open=>{if(!open)setInspect(null);}}><DialogContent className="canasta-dialog"><DialogTitle>{inspected?`${inspected.cards.length} × ${inspected.rank}`:'Meld'}</DialogTitle><DialogDescription>{inspected?(canastaLabel(inspected)??'Meld'):''}</DialogDescription>{inspected&&<CardFan cards={inspected.cards}/>}</DialogContent></Dialog>
  {!ended&&snapshot?.settlement&&layer&&createPortal(<div className="canasta-felt text-white text-center text-sm" style={rectStyle(area.terminal)}><div>{s!.seats.map(seat=><p key={seat.id}>{players.find(p=>p.id===seat.id)?.profiles?.username??'Player'} · {s!.totals[seat.id]}{seat.id===s!.winner?' · Winner':''}</p>)}</div></div>,layer)}
 </>;
}
