import {useEffect,useRef,useState,type RefObject} from 'react';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';

export interface FiveAliveAwardEvent {id:string;word:string;difficulty:number;base:number;points:number;from:number}
const tiers=['','Very Easy','Easy','Medium','Hard','Very Hard'];
const multipliers=['','0.8','1.0','1.2','1.4','1.6'];
export const FIVE_ALIVE_AWARD_HOLD_MS=5000;
interface ScorePhase {startedAt:number;endsAt:number;from:number;to:number}

/** A local presentation receipt: it never advances or scores the game. */
export function FiveAliveAward({event,userId,target,onDone,onScore}:{event:FiveAliveAwardEvent;userId:string;
 target:RefObject<HTMLDivElement>;onDone:()=>void;onScore:(value:number|null)=>void}){
 const total=useRef<HTMLElement>(null),[phase,setPhase]=useState<ScorePhase|null>(null);
 // Start the reading interval after the receipt has committed, not during render.
 useEffect(()=>{const startedAt=performance.now()+FIVE_ALIVE_AWARD_HOLD_MS;
  setPhase({startedAt,endsAt:startedAt+700,from:event.from,to:event.from+event.points});
 },[event.id,event.from,event.points]);
 usePresentedScoreAudio(userId,phase?event.id:null,phase,performance.now());
 useEffect(()=>{
  if(!phase)return;
  const element=total.current,destination=target.current;
  if(element&&destination&&typeof element.animate==='function'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   const from=element.getBoundingClientRect(),to=destination.getBoundingClientRect();
   const animation=element.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(.3)`,opacity:0}],{duration:600,delay:Math.max(0,phase.startedAt-performance.now()),easing:'ease-in',fill:'forwards'});
   return()=>animation.cancel();
  }
 },[target,phase]);
 useEffect(()=>{
  if(!phase)return;
  let frame=0;
  const tick=(now:number)=>{
   const fraction=Math.min(1,Math.max(0,(now-phase.startedAt)/(phase.endsAt-phase.startedAt)));
   onScore(Math.round(phase.from+(phase.to-phase.from)*fraction));
   if(fraction<1)frame=requestAnimationFrame(tick);else onDone();
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);onScore(null);};
 },[phase,onDone,onScore]);
 return <div className="five-alive-award" role="status"><div className="five-alive-award-tiles">{[...event.word].map((letter,i)=><span key={i}>{letter}</span>)}</div>
  <div className="five-alive-award-calculation">{event.base.toLocaleString()} base × {multipliers[event.difficulty]} · {tiers[event.difficulty]}</div>
  <strong className="five-alive-award-total" ref={total}>+{event.points.toLocaleString()}</strong></div>;
}
