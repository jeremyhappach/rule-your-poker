import {useEffect,useMemo} from 'react';
import {useTriIntentBuffer} from './useTriIntentBuffer';
import {delayedRequest,DelayedRequestError} from '@/lib/delayed/client';
import {RejectedTriAction,UncertainTriAction,type IntentView} from '@/lib/triTowers/intentBuffer';
import type {project} from '../../server/delayed/adapter';
type Snapshot=Awaited<ReturnType<typeof project>>;

/** Async transport for the existing ordered buffer. No local gameplay reduction. */
export function useAsyncTriInput({childId,userId,read,accept,available,now,enabled,interruptAudio}:{
 childId:string;userId:string;read:()=>Snapshot|null;accept:(value:Snapshot)=>void;
 available:boolean;now:()=>number;enabled:boolean;interruptAudio:()=>void;
}){
 const lifetime=useMemo(()=>({active:true}),[childId,userId]);
 useEffect(()=>{lifetime.active=true;return()=>{lifetime.active=false;};},[lifetime]);
 const view=(s:Snapshot|null):IntentView|null=>{
  if(!s||s.game!=='tri-towers')return null;
  const b=s.board as {phase:string;waste:number;cards:(number|null)[];removed:number[];deadline:number}|null;
  return {scope:`${childId}:${userId}:${s.segment}`,actor:userId,roundId:String(s.segment),revision:s.revision,
   phase:b?.phase??'complete',waste:b?.waste??-1,cards:b?.cards??[],removed:b?.removed??[],
   allowed:available&&s.actor===userId&&!s.terminal&&!s.held&&!!b&&now()<Math.min(b.deadline,Date.parse(s.expiresAt))&&!document.hidden&&navigator.onLine};
 };
 return useTriIntentBuffer(`async:${childId}:${userId}`,()=>view(read()),async command=>{
  const segment=Number(command.roundId);
  if(!Number.isSafeInteger(segment)||command.scope!==`${childId}:${userId}:${segment}`)throw new RejectedTriAction('Invalid pending turn.');
  try{
   const value=await delayedRequest<Snapshot>({op:'action',game:'tri-towers',childId,revision:command.revision,segment,requestId:command.requestId,intent:command.intent});
   if(!lifetime.active)throw new UncertainTriAction('Turn closed before confirmation.');
   accept(value);
   return view(read())!;
  }catch(error){
   if(!lifetime.active)throw new UncertainTriAction('Turn closed before confirmation.');
   interruptAudio();
   if(error instanceof DelayedRequestError&&error.status<500){
    // Restore authoritative state before clearing a rejected play and its queue.
    try{const value=await delayedRequest<Snapshot>({op:'state',childId});
     if(!lifetime.active)throw new UncertainTriAction('Turn closed before confirmation.');
     accept(value);}
    catch{throw new UncertainTriAction('Unable to verify the latest board.');}
    throw new RejectedTriAction(error.message);
   }
   // Keep the exact persisted request ID; Resolve play retries that receipt.
   throw new UncertainTriAction('Play outcome is uncertain.');
  }
 },enabled);
}
