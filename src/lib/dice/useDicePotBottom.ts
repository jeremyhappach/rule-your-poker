import { useLayoutEffect, useState } from 'react';
import { useCanonicalFeltCoordFrameElement } from '@/lib/canonicalShell/useCanonicalFeltCoordFrameElement';

/** Read the canonical pot's actual bounds in the same frame as anchored slots. */
export function useDicePotBottom(gameType: string, vminInPx: number) {
  const frame = useCanonicalFeltCoordFrameElement(true);
  const [bottom,setBottom] = useState<number|null>(null);
  useLayoutEffect(()=>{
    if (!frame || vminInPx <= 0) return;
    let pot: HTMLElement|null = null;
    const read=()=>{
      const next=document.querySelector<HTMLElement>(`[data-dice-pot-reserve="${gameType}"]`);
      if(next!==pot){if(pot)resize.unobserve(pot);pot=next;if(pot)resize.observe(pot);}
      const rect=pot?.getBoundingClientRect();
      setBottom(rect && rect.width>0 && rect.height>0 ? (rect.bottom-frame.getBoundingClientRect().top)/vminInPx : null);
    };
    const resize=new ResizeObserver(read);
    resize.observe(frame);
    const selector=`[data-dice-pot-reserve="${gameType}"]`;
    const mutation=new MutationObserver(records=>{
      // Dice faces mutate during animation. Only pot mount/replacement can
      // change this reservation; its size changes are handled by ResizeObserver.
      if(!pot || !pot.isConnected || records.some(record=>[...record.addedNodes].some(node=>
        node instanceof Element && (node.matches(selector)||node.querySelector(selector))))) read();
    });
    mutation.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('transitionend',read);
    read();
    return()=>{resize.disconnect();mutation.disconnect();document.removeEventListener('transitionend',read);};
  },[frame,gameType,vminInPx]);
  return bottom;
}
