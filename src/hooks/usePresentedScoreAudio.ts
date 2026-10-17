import {useEffect} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {scoreCountCue} from '@/lib/run21/scoreCountCue';

export function usePresentedScoreAudio(userId:string,key:string|null,phase:{startedAt:number;endsAt:number;from:number;to:number}|null|undefined,now:number){
 useEffect(()=>{
  if(!key||!phase)return;
  const local=performance.now();
  return platformAudio.follow({userId,id:key,startedAt:local-(now-phase.startedAt),expiresAt:local+phase.endsAt-now,
   cueAt:(at,left)=>scoreCountCue(phase.from,phase.to,at,left)});
  // A presented event has one audio owner; clock renders do not restart it.
 },[key,userId]);
}
