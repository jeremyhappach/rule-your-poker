import {useEffect} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {fiveAliveCountCue} from './fiveAliveAudio';

/** Follow the committed score clock; mute/recovery belongs to platformAudio. */
export function useFiveAliveScoreAudio(userId:string,key:string|null,phase:{startedAt:number;endsAt:number;from:number;to:number}|null|undefined,now:number){
 useEffect(()=>{
  if(!key||!phase||phase.from===phase.to)return;
  const local=performance.now();
  const startedAt=local-(now-phase.startedAt);
  const stop=platformAudio.follow({userId,id:`five-alive-count:${key}`,startedAt,expiresAt:local+phase.endsAt-now,cueAt:fiveAliveCountCue});
  // The manager admits only due timelines. Wake it at this presentation's
  // existing score deadline, without advancing gameplay or replaying muted cues.
  const wake=setTimeout(()=>platformAudio.unlock(),Math.max(0,Math.ceil(startedAt-performance.now()))+1);
  return()=>{clearTimeout(wake);stop();};
  // Clock renders must not restart this presentation receipt.
 },[key,userId]);
}
