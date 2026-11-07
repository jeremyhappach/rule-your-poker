import {useEffect,type RefObject} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {RUN21_FAILURE_CUE_MS,run21FailureCueAt} from '@/lib/run21/failureCue';

/** The committed round result owns this cue; a cracked hand is not a round bust. */
export function useChuckyBustAudio(userId:string,identity:string,busted:boolean,live:boolean,root:RefObject<HTMLElement>){
  useEffect(()=>{
    if(!busted||!live||!isSoundSurfaceVisible(root.current))return;
    const startedAt=performance.now();
    return platformAudio.follow({userId,id:'chucky-round-bust:'+identity,startedAt,
      expiresAt:startedAt+RUN21_FAILURE_CUE_MS,cueAt:run21FailureCueAt});
  },[userId,identity,busted,live,root]);
}
