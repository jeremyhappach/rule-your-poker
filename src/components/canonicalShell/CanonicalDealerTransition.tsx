import {useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {DealerIndicator} from './DealerIndicator';
/** Presentation-only movement between the canonical chip anchors. */
export function CanonicalDealerTransition({from,to,elapsed}:{from:number;to:number;elapsed:number}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const a=document.querySelector(`[data-chip-center="${from}"]`)?.getBoundingClientRect(),b=document.querySelector(`[data-chip-center="${to}"]`)?.getBoundingClientRect(),node=ref.current;if(!a||!b||!node)return;
  node.style.visibility='visible';const animation=node.animate([{transform:`translate(${a.x+a.width/2}px,${a.y+a.height/2}px)`},{transform:`translate(${b.x+b.width/2}px,${b.y+b.height/2}px)`}],{duration:650,easing:'ease-in-out',fill:'both'});animation.currentTime=window.matchMedia('(prefers-reduced-motion: reduce)').matches?650:elapsed;return()=>{animation.cancel();node.style.visibility='hidden';};
 },[from,to]);
 return createPortal(<div ref={ref} style={{position:'fixed',top:0,left:0,pointerEvents:'none',zIndex:100,visibility:'hidden'}}><DealerIndicator size="md"/></div>,document.body);
}
