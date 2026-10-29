import {useEffect,useRef,useState} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {RUN21_FAILURE_CUE_MS,run21FailureCueAt} from '@/lib/run21/failureCue';
import {outcomePresentation} from '@/lib/run21/outcomePresentation';
import {displayedPlayerId} from '@/lib/run21/presentation';
import type {BoardProjection} from '@/lib/run21/model';

/** One live confirmed failure cue for either mode; recovery establishes a silent baseline. */
export function useRun21FailureAudio(userId:string,scope:string,view:BoardProjection|undefined,now:number,epoch:number,enabled:boolean,replay=false){
  const [interruption,setInterruption]=useState(0);
  const receipts=useRef({context:'',seen:new Set<string>()});
  const active=useRef<{context:string;key:string;stop:()=>void}|null>(null);
  useEffect(()=>{
    if(!view)return;
    const context=JSON.stringify([userId,scope,epoch,interruption]);
    const baseline=receipts.current.context!==context;
    if(baseline)receipts.current={context,seen:new Set()};
    const playerId=displayedPlayerId(view),result=view.boards[playerId]?.result,phase=view.scorePresentation;
    const key=result?JSON.stringify([scope,view.roundId,playerId,result.at,result.reason]):null;
    const audible=enabled&&!document.hidden&&navigator.onLine&&view.pausedAt==null&&(!view.revealed||replay);
    if(active.current&&(active.current.context!==context||active.current.key!==key||!audible||!phase||now>=phase.endsAt)){
      active.current.stop();active.current=null;
    }
    if(!key||receipts.current.seen.has(key))return;
    receipts.current.seen.add(key);
    if(baseline&&!replay||!audible||!result||!phase||phase.playerId!==playerId||
      now<phase.startedAt||now-phase.startedAt>1500||phase.endsAt-now<RUN21_FAILURE_CUE_MS||
      outcomePresentation(result,'').kind==='score')return;
    const startedAt=performance.now();
    active.current={context,key,stop:platformAudio.follow({userId,id:'run21-failure:'+key,startedAt,
      expiresAt:startedAt+RUN21_FAILURE_CUE_MS,cueAt:run21FailureCueAt})};
    // Clock paints and identical snapshots keep the same owner until the cue finishes.
  },[scope,view,now,epoch,enabled,userId,interruption,replay]);
  useEffect(()=>{
    const cancel=()=>{active.current?.stop();active.current=null;};
    const interrupt=()=>{cancel();setInterruption(value=>value+1);};
    window.addEventListener('offline',interrupt);document.addEventListener('visibilitychange',interrupt);
    return()=>{cancel();window.removeEventListener('offline',interrupt);document.removeEventListener('visibilitychange',interrupt);};
  },[scope,epoch,userId,enabled]);
}
