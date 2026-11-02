import {useEffect,useLayoutEffect,useRef,useState} from 'react';

import {useQuintzeeRollTiming,QUINTZEE_ROLL_TIMING_DEFAULTS} from '@/lib/geometryLab/quintzeeRollTiming';
export const QUINTZEE_RUMBLE_MS=QUINTZEE_ROLL_TIMING_DEFAULTS.durationMs;

/** One presentation per newly observed roll. Reconnect never replays old dice. */
export function useQuintzeeRumble(scope:string,serial:number,diceCount:number,held:readonly number[],playing:boolean,onLanding?:(identity:string,indices:number[])=>void){
 const landing=useRef(onLanding);landing.current=onLanding;
 const interrupted=useRef(false);
 useEffect(()=>{
  const retire=()=>{interrupted.current=true;},hidden=()=>{if(document.hidden)retire();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('offline',retire);
  return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('offline',retire);};
 },[]);
 const {durationMs}=useQuintzeeRollTiming();
 const duration=useRef(durationMs);duration.current=durationMs;
 const identity=`${scope}:${serial}`;
 const previous=useRef(identity);
 const [animation,setAnimation]=useState<{identity:string;held:readonly number[]}|null>(null);
 useLayoutEffect(()=>{
  const changed=previous.current!==identity;
  previous.current=identity;
  if(!playing||diceCount!==5){setAnimation(null);return;}
  if(!changed)return;
  interrupted.current=document.hidden||!navigator.onLine;
  setAnimation({identity,held:[...held]});
  const timer=setTimeout(()=>{setAnimation(null);if(!interrupted.current)landing.current?.(identity,Array.from({length:diceCount},(_,i)=>i).filter(i=>!held.includes(i)));},duration.current);
  return()=>clearTimeout(timer);
  // Held values belong to this roll; local hold toggles do not restart it.
 },[identity,diceCount,playing]);
 return animation?.identity===identity&&playing?animation:null;
}
