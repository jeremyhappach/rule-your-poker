import {useEffect} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {scoreCountCue} from '@/lib/run21/scoreCountCue';
import type {BoardProjection} from '@/lib/run21/model';

export function useRun21ScoreAudio(userId:string,scope:string,view:BoardProjection|undefined,now:number,enabled=true){
  const phase=view?.scorePresentation;
  const active=enabled&&view?.pausedAt==null&&phase&&phase.to>phase.from&&now>=phase.startedAt&&now<phase.endsAt;
  const key=active?JSON.stringify([scope,view.roundId,phase.playerId,phase.from,phase.to]):null;
  useEffect(()=>{
    if(!key||!phase)return;
    const local=performance.now(),elapsed=now-phase.startedAt,remaining=phase.endsAt-now;
    return platformAudio.follow({userId,id:'run21-count:'+key,startedAt:local-elapsed,expiresAt:local+remaining,
      cueAt:(at,left)=>scoreCountCue(phase.from,phase.to,at,left)});
    // One owner per presented scoring event; clock renders must not restart the cue.
  },[key,userId]);
}
