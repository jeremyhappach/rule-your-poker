import {useEffect,useRef,useState} from 'react';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
import {royalScoreFrame} from '@/lib/royalFlash/scoringPresentation';
import {platformAudio} from '@/lib/audio/platformAudio';
import {royalScoreCue} from '@/lib/royalFlash/scoreCue';

export function useRoyalScoringPresentation(view:RoyalSnapshot,userId:string,epoch:number,active:boolean,now:number){
 const previous=useRef<{scope:string;phase:string;epoch:number;active:boolean;userId:string}|null>(null);
 const [admitted,setAdmitted]=useState<string|null>(null);
 const phase=view.board.phase,identity=`${view.scope}:${view.board.result?.id??view.board.result?.completedAt}`;
 const admission=`${identity}:${epoch}:${userId}`;
 useEffect(()=>{
  const prior=previous.current;previous.current={scope:view.scope,phase,epoch,active,userId};
  if(!active||!prior?.active||prior.scope!==view.scope||prior.epoch!==epoch||prior.userId!==userId||phase!=='stage_complete')setAdmitted(null);
  else if(prior.phase==='playing'||prior.phase==='ready')setAdmitted(admission);
 },[view.scope,phase,epoch,active,userId,admission]);
 const frame=royalScoreFrame(view.board,now);
 const audioKey=active&&admitted===admission&&view.board.result?.presentationMs?`royal-score:${identity}`:null;
 useEffect(()=>{
  const result=view.board.result;if(!audioKey||!result?.presentationMs)return;
  const local=performance.now(),startedAt=view.board.deadline-result.presentationMs;
  return platformAudio.follow({userId,id:audioKey,startedAt:local-(now-startedAt),expiresAt:local+view.board.deadline-now,cueAt:(elapsed,left)=>royalScoreCue(result,elapsed,left)});
  // One admitted result owns the complete schedule; frame renders never restart it.
 },[audioKey,userId]);
 return frame;
}
