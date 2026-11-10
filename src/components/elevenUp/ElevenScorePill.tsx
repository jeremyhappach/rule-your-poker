import {useEffect,useRef,useState,type ReactNode} from 'react';

/** Arcade's existing home-slot/translated-pill pattern, within the same felt. */
export function ElevenScorePill({active,winner,fraction,children,bonuses}:{active:boolean;winner:boolean;fraction:number;children:ReactNode;bonuses?:ReactNode}){
 const home=useRef<HTMLDivElement>(null),[offset,setOffset]=useState({x:0,y:0});
 useEffect(()=>{
  const target=home.current,board=target?.closest('.eleven-plane');if(!target||!board)return;
  const measure=()=>{const a=target.getBoundingClientRect(),b=board.getBoundingClientRect();setOffset({x:b.left+b.width/2-a.left-a.width/2,y:b.top+b.height*.5-a.top-a.height/2});};
  const observer=new ResizeObserver(measure);observer.observe(target);observer.observe(board);measure();return()=>observer.disconnect();
 },[]);
 return <div ref={home} className="eleven-score-home" data-active={active}>
  <div className="eleven-score-pill" data-active={active} data-winner={winner} data-centered={fraction>0} style={{transform:`translate(${offset.x*fraction}px,${offset.y*fraction}px)`}}>
   {children}{bonuses&&<div className="eleven-score-bonuses">{bonuses}</div>}
  </div>
 </div>;
}
