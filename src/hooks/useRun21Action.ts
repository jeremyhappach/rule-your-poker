import {useCallback,useEffect,useRef,useState} from 'react';
import {storedAction,UncertainRun21Action,type PendingRun21Action} from '@/lib/run21/actionPresentation';
import {run21Timing} from '@/lib/run21/diagnostics';

/** One immutable request at a time. Recovery retries that request, never a new intention. */
export function useRun21Action(scope:string,ready:boolean,send:(command:PendingRun21Action)=>Promise<void>){
 const key='run21-pending:v1:'+scope,sendRef=useRef(send),readyRef=useRef(ready);
 sendRef.current=send;readyRef.current=ready;
 const current=useRef<PendingRun21Action|null>(null),running=useRef(false),generation=useRef(0);
 const [command,setCommand]=useState<PendingRun21Action|null>(null),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const execute=useCallback(async()=>{
  const action=current.current;if(!action||running.current||!readyRef.current||document.hidden||!navigator.onLine)return;
  running.current=true;const epoch=generation.current;setError('');setUncertain(false);
  try{
   await sendRef.current(action);
   if(epoch!==generation.current)return;
   current.current=null;setCommand(null);try{sessionStorage.removeItem(key);}catch{}
  }catch(e){
   if(epoch!==generation.current)return;
   if(e instanceof UncertainRun21Action){setUncertain(true);setError('Connection interrupted. Reconnect to resolve your last play.');}
   else{current.current=null;setCommand(null);try{sessionStorage.removeItem(key);}catch{}setError(e instanceof Error?e.message:'Action rejected.');}
  }finally{if(epoch===generation.current)running.current=false;}
 },[key]);
 useEffect(()=>{
  generation.current++;running.current=false;current.current=null;setCommand(null);setError('');setUncertain(false);
  try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(storedAction(saved)){current.current=saved;setCommand(saved);setUncertain(true);}}catch{}
  return()=>{generation.current++;};
 },[key]);
 useEffect(()=>{if(ready)void execute();},[ready,execute]);
 useEffect(()=>{
  const resume=()=>{if(!document.hidden)void execute();};
  window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  return()=>{window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[execute]);
 const submit=useCallback((action:PendingRun21Action)=>{
  if(current.current||!readyRef.current||document.hidden||!navigator.onLine)return;
  const frozen=structuredClone(action);current.current=frozen;setCommand(frozen);setUncertain(false);setError('');
  try{sessionStorage.setItem(key,JSON.stringify(frozen));}catch{/* Mounted recovery still retains the request. */}
  run21Timing('intent',frozen.requestId);return execute();
 },[key,execute]);
 return {submit,recover:execute,pending:!!command,placement:uncertain?null:command,error};
}
