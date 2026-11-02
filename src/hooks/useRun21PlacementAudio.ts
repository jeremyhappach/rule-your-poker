import {useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {PlacementAudio} from '@/lib/run21/placementAudio';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';

export function useRun21PlacementAudio(userId:string,scope:string,events:BoardFeedbackEvent[]|undefined,epoch:number,enabled:boolean,passReceipt:string|null=null){
  const [interruption,setInterruption]=useState(0);
  const lastPass=useRef(passReceipt);
  const receipts=useRef(new PlacementAudio()),stops=useRef(new Set<()=>void>());
  useEffect(()=>{
    let action=receipts.current.accept(scope+':'+interruption,epoch,events??[],enabled&&!document.hidden&&navigator.onLine);
    if(passReceipt!==lastPass.current){
      lastPass.current=passReceipt;
      if(passReceipt&&enabled&&!document.hidden&&navigator.onLine)action={key:passReceipt,kind:'pass'};
    }
    if(!action)return;
    const approved=approvedSound(action.kind==='play'?'slide':'flip');
    // A committed Pass is its own confirmation, not another throttled card flip.
    const cue=approved&&action.kind==='pass'?{...approved,policy:{priority:50,group:'run21-pass',intervalMs:0}}:approved;
    if(!cue){platformAudio.present({userId,id:'run21-swoosh:'+action.key});return;}
    const startedAt=performance.now();
    // A fresh Pass may be the first gesture after reload; bound native resume to 150 ms.
    const lifetime=cue.durationMs+(action.kind==='pass'?150:25);
    const stop=platformAudio.follow({userId,id:'run21-swoosh:'+action.key,startedAt,expiresAt:startedAt+lifetime,cueAt:()=>cue});
    stops.current.add(stop);
    setTimeout(()=>stops.current.delete(stop),lifetime+20);
    // A newer action must not truncate the preceding cue.

  },[scope,events,epoch,enabled,userId,interruption,passReceipt]);
  useEffect(()=>{
    const cancel=()=>{stops.current.forEach(stop=>stop());stops.current.clear();};
    const hidden=()=>{cancel();setInterruption(n=>n+1);};
    window.addEventListener('offline',hidden);document.addEventListener('visibilitychange',hidden);
    return()=>{cancel();window.removeEventListener('offline',hidden);document.removeEventListener('visibilitychange',hidden);};
  },[scope,epoch,userId,enabled]);
}
