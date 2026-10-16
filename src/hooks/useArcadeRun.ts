import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ArcadeIntent,ArcadeSnapshot} from '@/lib/arcade/model';
export function useArcadeRun(runId:string){
 const [snapshot,setSnapshot]=useState<ArcadeSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [now,setNow]=useState(0),state=useRef<ArcadeSnapshot|null>(null),generation=useRef(0),busy=useRef(false);
 const anchor=useRef({server:0,local:0}),initial=useRef(true),[completedOnEntry,setCompletedOnEntry]=useState(false);
 const accept=useCallback((value:ArcadeSnapshot)=>{
  if(value.id!==runId)return;
  const previous=state.current;
  if(previous&&value.revision<previous.revision)return;
  if(previous&&value.revision===previous.revision&&JSON.stringify(value.view)!==JSON.stringify(previous.view)){
   setError('State changed unexpectedly. Reconnect to verify your run.');return;
  }
  if(initial.current){setCompletedOnEntry(value.status!=='active');initial.current=false;}
  anchor.current={server:value.serverAt,local:performance.now()};state.current=value;setSnapshot(value);setNow(value.serverAt);setError('');
 },[runId]);
 const refresh=useCallback(async()=>{
  const current=generation.current;
  try{const value=await arcadeRequest<ArcadeSnapshot>({op:'state',runId});if(current===generation.current)accept(value);}
  catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Connection lost.');}
 },[runId,accept]);
 useEffect(()=>{
  generation.current++;state.current=null;initial.current=true;busy.current=false;setSnapshot(null);setPending(false);setCompletedOnEntry(false);
  void refresh();
  const channel=supabase.channel('arcade:'+runId+':'+crypto.randomUUID()).on('postgres_changes',
   {event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+runId},()=>void refresh()).subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);
  let frame=0,last=0;const tick=(time:number)=>{if(time-last>=80){last=time;setNow(anchor.current.server+performance.now()-anchor.current.local);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{generation.current++;cancelAnimationFrame(frame);void supabase.removeChannel(channel);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible);};
 },[runId,refresh]);
 // A single fetch at the persisted boundary keeps connected intros timely.
 // This never advances local state; the independent worker owns zero-client recovery.
 useEffect(()=>{
  if(snapshot?.dueAt==null)return;
  const remaining=snapshot.dueAt-(anchor.current.server+performance.now()-anchor.current.local);
  const timer=setTimeout(()=>void refresh(),Math.max(0,remaining)+25);
  return()=>clearTimeout(timer);
 },[snapshot?.revision,snapshot?.dueAt,refresh]);
 const act=useCallback(async(intent:ArcadeIntent)=>{
  const current=state.current;if(!current||busy.current)return;
  busy.current=true;setPending(true);const scope=generation.current;
  try{const value=await arcadeRequest<ArcadeSnapshot>({op:'action',runId,requestId:crypto.randomUUID(),revision:current.revision,roundId:current.view.roundId,intent});if(scope===generation.current)accept(value);}
  catch(e){if(scope===generation.current){await refresh();setError(e instanceof Error?e.message:'Action failed.');}}
  finally{if(scope===generation.current){busy.current=false;setPending(false);}}
 },[runId,accept,refresh]);
 return {snapshot,error,pending,now,act,refresh,completedOnEntry};
}

