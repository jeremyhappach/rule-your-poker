import {useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {cardSwooshCueAt} from '@/lib/audio/cardSwoosh';
import {PlacementAudio} from '@/lib/run21/placementAudio';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';

export function useRun21PlacementAudio(userId:string,scope:string,events:BoardFeedbackEvent[]|undefined,epoch:number,enabled:boolean){
  const [interruption,setInterruption]=useState(0);
  const receipts=useRef(new PlacementAudio()),stops=useRef(new Set<()=>void>());
  useEffect(()=>{
    const key=receipts.current.accept(scope+':'+interruption,epoch,events??[],enabled&&!document.hidden&&navigator.onLine);
    if(!key)return;
    const startedAt=performance.now();
    const stop=platformAudio.follow({userId,id:'run21-swoosh:'+key,startedAt,expiresAt:startedAt+100,cueAt:cardSwooshCueAt});
    stops.current.add(stop);
    setTimeout(()=>stops.current.delete(stop),120);
    // A newer placement must not truncate the preceding 100 ms cue.

  },[scope,events,epoch,enabled,userId,interruption]);
  useEffect(()=>{
    const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();};
    const hidden=()=>{cancel();setInterruption(n=>n+1);};
    window.addEventListener('offline',hidden);document.addEventListener('visibilitychange',hidden);
    return()=>{cancel();window.removeEventListener('offline',hidden);document.removeEventListener('visibilitychange',hidden);};
  },[scope,epoch,userId,enabled]);
}
