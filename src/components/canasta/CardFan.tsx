import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import {isResolvedJoker,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {fanLayout,useCanastaGeometry} from './geometry';
export function CanastaFace({card,width=44,hidden=false}:{card:PhysicalCard;width?:number;hidden?:boolean}){
  return <PlayingCard card={isResolvedJoker(card.face)?undefined:card.face} jokerFace={isResolvedJoker(card.face)?card.face:undefined}
    physicalId={card.id} activeHandShell tier="large" faceFillPx={width} style={{width,height:Math.round(width*62/44),visibility:hidden?'hidden':undefined}}/>;
}
export function CardFan({cards,interactive=false,render}:{cards:PhysicalCard[];interactive?:boolean;render?:(card:PhysicalCard,width:number)=>ReactNode}){
  const config=useCanastaGeometry(),ref=useRef<HTMLDivElement>(null),[available,setAvailable]=useState(0);
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(()=>setAvailable(el.clientWidth));observer.observe(el);setAvailable(el.clientWidth);return()=>observer.disconnect();},[]);
  const layout=fanLayout(available,cards.length,config.cardWidth,interactive?config.handOverlap:config.meldOverlap,interactive);
  return <div ref={ref} className="canasta-card-fan" style={{gridTemplateColumns:`repeat(${layout.columns}, ${layout.step}px)`,'--canasta-fan-step':`${layout.step}px`,'--canasta-fan-height':`${layout.height}px`} as CSSProperties}>
    {cards.map(card=><div key={card.id} className="canasta-fan-slot" data-fan-card={card.id} style={{width:layout.width,height:layout.height}}>
      {render?render(card,layout.width):<CanastaFace card={card} width={layout.width}/>}
    </div>)}
  </div>;
}
