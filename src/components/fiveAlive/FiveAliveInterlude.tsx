import {useEffect} from 'react';
import {AsyncTurnStage} from '@/components/delayed/AsyncTurnStage';
import {usePlayback} from '@/lib/delayed/usePlayback';
import {platformAudio} from '@/lib/audio/platformAudio';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {run21FailureCueAt} from '@/lib/run21/failureCue';

export function FiveAliveIntro({identity,title,matchId,userId,bell=false,onDone}:{identity:string;title:string;matchId?:string;userId:string;bell?:boolean;onDone:()=>void}){
 const play=usePlayback(1800,identity);
 useEffect(()=>{if(bell&&!document.hidden)return platformAudio.request({userId,id:'five-alive-intro:'+identity,expiresAt:performance.now()+1800,cue:boxingBellCue});},[bell,identity,userId]);
 useEffect(()=>{if(play.done)onDone();},[play.done,onDone]);
 return <AsyncTurnStage matchId={matchId} title={title}/>;
}

/** Local accepted-result presentation; it never submits or settles a game. */
export function FiveAliveFailure({identity,answer,userId,onDone}:{identity:string;answer:string;userId:string;onDone:()=>void}){
 const play=usePlayback(5000,identity);
 useEffect(()=>{if(!document.hidden)return platformAudio.request({userId,id:'five-alive-failure:'+identity,expiresAt:performance.now()+1100,cue:run21FailureCueAt(0,1100)});},[identity,userId]);
 useEffect(()=>{if(play.done)onDone();},[play.done,onDone]);
 return <div className="five-alive-award five-alive-failure" role="status"><h2>You failed!</h2><p>The answer was <strong>{answer}</strong></p><p>Failed in 6 guesses · 0 points</p><small>Returning to Async matches…</small></div>;
}
