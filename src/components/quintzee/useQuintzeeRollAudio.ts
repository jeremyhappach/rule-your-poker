import {useLayoutEffect,type RefObject} from 'react';
import {startRollSound} from '@/lib/audio/diceRollSound';
/** The existing rumble state owns the exact stop; no landing or audio timer. */
export function useQuintzeeRollAudio(rumble:{identity:string;held:readonly number[]}|null,active:boolean,surface:RefObject<HTMLElement>){
 useLayoutEffect(()=>{
  if(!rumble||rumble.held.length>=5)return;
  const stop=startRollSound('quintzeeRoll',rumble.identity,active?surface.current:null);
  const hidden=()=>{if(document.hidden)stop();};
  window.addEventListener('offline',stop);document.addEventListener('visibilitychange',hidden);
  return()=>{stop();window.removeEventListener('offline',stop);document.removeEventListener('visibilitychange',hidden);};
 },[rumble?.identity,active,surface]);
}
