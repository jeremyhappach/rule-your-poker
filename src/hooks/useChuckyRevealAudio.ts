import {useCallback,useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import type {AudioCue} from '@/lib/audio/audioManager';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';

/** Only the first actual card flip starts this sequence; no selection is shipped yet. */
export function useChuckyRevealAudio(identity:string|null|undefined,cue?:AudioCue) {
  const stopRef=useRef<()=>void>(()=>{}),seen=useRef<string|null>(null);
  const [active,setActive]=useState(false);
  const stop=useCallback(()=>{stopRef.current();stopRef.current=()=>{};setActive(false);},[]);
  useEffect(()=>{
    const retire=()=>{if(identity)seen.current=identity;stop();};
    const hidden=()=>{if(document.hidden)retire();};
    window.addEventListener('pagehide',retire);window.addEventListener('offline',retire);document.addEventListener('visibilitychange',hidden);
    const unsubscribe=platformAudio.subscribe(()=>{if(platformAudio.getSnapshot().enabled!==true)stop();});
    return()=>{stop();unsubscribe();window.removeEventListener('pagehide',retire);window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',hidden);};
  },[identity,stop]);
  const start=useCallback((surface:Element)=>{
    if(!identity||seen.current===identity)return;
    seen.current=identity;
    const {userId}=platformAudio.getSnapshot();
    if(!userId||!cue)return;
    platformAudio.present({userId,id:'chucky-reveal:'+identity,cue:isSoundSurfaceVisible(surface)?cue:undefined},cancel=>{stopRef.current=cancel;setActive(true);});
  },[identity,cue]);
  return {start,stop,active};
}
