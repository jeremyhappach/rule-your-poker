import {useEffect,useRef,useState} from 'react';
import type {RoyalSnapshot} from '@/lib/royalFlash/model';
import {royalScoreFrame} from '@/lib/royalFlash/scoringPresentation';
import {usePresentedScoreAudio} from './usePresentedScoreAudio';

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
 usePresentedScoreAudio(userId,active&&admitted===admission&&frame&&frame.to>frame.from&&now>=frame.startedAt?`royal-score:${identity}:${frame.key}`:null,frame,now);
 return frame;
}
