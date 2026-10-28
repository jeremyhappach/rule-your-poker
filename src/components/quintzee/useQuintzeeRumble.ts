import {useLayoutEffect,useRef,useState} from 'react';

import {useQuintzeeRollTiming,QUINTZEE_ROLL_TIMING_DEFAULTS} from '@/lib/geometryLab/quintzeeRollTiming';
export const QUINTZEE_RUMBLE_MS=QUINTZEE_ROLL_TIMING_DEFAULTS.durationMs;

/** One presentation per newly observed roll. Reconnect never replays old dice. */
export function useQuintzeeRumble(scope:string,serial:number,diceCount:number,held:readonly number[],playing:boolean){
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
  setAnimation({identity,held:[...held]});
  const timer=setTimeout(()=>setAnimation(null),duration.current);
  return()=>clearTimeout(timer);
  // Held values belong to this roll; local hold toggles do not restart it.
 },[identity,diceCount,playing]);
 return animation?.identity===identity&&playing?animation:null;
}
