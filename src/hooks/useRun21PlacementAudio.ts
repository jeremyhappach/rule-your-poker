import {useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {PlacementAudio} from '@/lib/run21/placementAudio';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';

export function useRun21PlacementAudio(userId:string,scope:string,events:BoardFeedbackEvent[]|undefined,epoch:number,enabled:boolean){
  const [interruption,setInterruption]=useState(0);
  const receipts=useRef(new PlacementAudio()),stops=useRef(new Set<()=>void>());
  useEffect(()=>{
    const action=receipts.current.accept(scope+':'+interruption,epoch,events??[],enabled&&!document.hidden&&navigator.onLine);
    if(!action)return;
    const cue=approvedSound(action.kind==='play'?'slide':'flip');
    if(!cue){platformAudio.present({userId,id:'run21-swoosh:'+action.key});return;}
    const startedAt=performance.now();
    // Allow only 25 ms to admit the complete approved cue; never catch up late.
    const lifetime=cue.durationMs+25;
    const stop=platformAudio.follow({userId,id:'run21-swoosh:'+action.key,startedAt,expiresAt:startedAt+lifetime,cueAt:()=>cue});
    stops.current.add(stop);
    setTimeout(()=>stops.current.delete(stop),lifetime+20);
    // A newer action must not truncate the preceding cue.

  },[scope,events,epoch,enabled,userId,interruption]);
  useEffect(()=>{
    const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();};
    const hidden=()=>{cancel();setInterruption(n=>n+1);};
    window.addEventListener('offline',hidden);document.addEventListener('visibilitychange',hidden);
    return()=>{cancel();window.removeEventListener('offline',hidden);document.removeEventListener('visibilitychange',hidden);};
  },[scope,epoch,userId,enabled]);
}
