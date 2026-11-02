import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedCountdownBeat} from '@/lib/audio/approvedSounds';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import type {ThreeFiveSevenDecisionRevealClock,ThreeFiveSevenDecisionRevealFrame} from '@/lib/threeFiveSeven/decisionReveal';

/** Observe the real displayed beats. A window first seen mid-count is history;
 * late unlock, repaint and interruption never schedule missed tones. */
export function useDecisionCountdownAudio(clock:ThreeFiveSevenDecisionRevealClock|null,frame:ThreeFiveSevenDecisionRevealFrame|null,visible:boolean,surface:RefObject<HTMLElement>){
 const receipt=useRef<{id:string|null;armed:boolean;beat:string|null}>({id:null,armed:false,beat:null});
 useEffect(()=>{
  const retire=()=>{receipt.current.armed=false;},hidden=()=>{if(document.hidden)retire();};
  window.addEventListener('offline',retire);window.addEventListener('pagehide',retire);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('offline',retire);window.removeEventListener('pagehide',retire);document.removeEventListener('visibilitychange',hidden);};
 },[]);
 useLayoutEffect(()=>{
  const id=clock?.window.id??null,beat=frame?.beat??null;
  if(receipt.current.id!==id)receipt.current={id,armed:beat==='locked'&&!document.hidden&&navigator.onLine,beat:null};
  const old=receipt.current.beat;receipt.current.beat=beat;
  if(!id||!beat||old===beat||!receipt.current.armed||!['3','2','1'].includes(beat))return;
  const {userId}=platformAudio.getSnapshot();if(!userId)return;
  platformAudio.present({userId,id:`357-countdown:${id}:${beat}`,
   cue:visible&&isSoundSurfaceVisible(surface.current)?approvedCountdownBeat(beat):undefined});
 },[clock?.window.id,frame?.beat,visible,surface]);
}
