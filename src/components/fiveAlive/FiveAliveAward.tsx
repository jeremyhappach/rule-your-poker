import {useEffect,useRef,useState,type RefObject} from 'react';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';

export interface FiveAliveAwardEvent {id:string;word:string;difficulty:number;points:number;from:number}
const tiers=['','Very Easy','Easy','Medium','Hard','Very Hard'];
const multipliers=['','0.8','1.0','1.2','1.4','1.6'];

/** A local presentation receipt: it never advances or scores the game. */
export function FiveAliveAward({event,userId,target,onDone,onScore}:{event:FiveAliveAwardEvent;userId:string;
 target:RefObject<HTMLDivElement>;onDone:()=>void;onScore:(value:number|null)=>void}){
 const row=useRef<HTMLDivElement>(null),[phase]=useState(()=>{const startedAt=performance.now()+600;return {startedAt,endsAt:startedAt+700,from:event.from,to:event.from+event.points};});
 usePresentedScoreAudio(userId,event.id,phase,performance.now());
 useEffect(()=>{
  const element=row.current,destination=target.current;
  if(element&&destination&&typeof element.animate==='function'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   const from=element.getBoundingClientRect(),to=destination.getBoundingClientRect();
   const animation=element.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(.3)`,opacity:0}],{duration:600,delay:350,easing:'ease-in',fill:'forwards'});
   return()=>animation.cancel();
  }
 },[target]);
 useEffect(()=>{
  let frame=0;
  const tick=(now:number)=>{
   const fraction=Math.min(1,Math.max(0,(now-phase.startedAt)/(phase.endsAt-phase.startedAt)));
   onScore(Math.round(phase.from+(phase.to-phase.from)*fraction));
   if(fraction<1)frame=requestAnimationFrame(tick);else onDone();
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);onScore(null);};
 },[phase,onDone,onScore]);
 return <div className="five-alive-award" role="status"><div className="five-alive-award-tiles" ref={row}>{[...event.word].map((letter,i)=><span key={i}>{letter}</span>)}</div>
  <strong>{tiers[event.difficulty]} · {multipliers[event.difficulty]}× · +{event.points.toLocaleString()}</strong></div>;
}
