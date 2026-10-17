import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ArcadeRunIntent,ArcadeSnapshot,ArcadeRunSnapshot} from '@/lib/arcade/model';
export function useArcadeRun<T extends ArcadeRunSnapshot=ArcadeSnapshot>(runId:string){
 const [snapshot,setSnapshot]=useState<T|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [now,setNow]=useState(0),state=useRef<T|null>(null),generation=useRef(0),busy=useRef(false);
 const anchor=useRef({server:0,local:0}),initial=useRef(true),[completedOnEntry,setCompletedOnEntry]=useState(false);
 const [completionLive,setCompletionLive]=useState(false),epoch=useRef(0),finishedSeen=useRef(false);
 const interrupt=useCallback(()=>{epoch.current++;setCompletionLive(false);},[]);
 const accept=useCallback((value:T,recovery=false,requestEpoch=epoch.current)=>{
  if(value.id!==runId)return;
  const previous=state.current;
  if(previous&&value.revision<previous.revision)return;
  if(previous&&value.revision===previous.revision&&JSON.stringify(value.view)!==JSON.stringify(previous.view)){
   setError('State changed unexpectedly. Reconnect to verify your run.');return;
  }
  if(initial.current){setCompletedOnEntry(value.status!=='active');initial.current=false;}
  if(value.status==='completed'&&!finishedSeen.current){
   finishedSeen.current=true;
   const key='arcade-completion:'+value.id;
   let seen=false;try{seen=sessionStorage.getItem(key)==='1';sessionStorage.setItem(key,'1');}catch{/* Initial-load suppression remains. */}
   setCompletionLive(!seen&&!recovery&&requestEpoch===epoch.current&&!document.hidden&&previous?.status==='active'&&
    !!value.view.scorePresentation&&value.serverAt<value.view.scorePresentation.endsAt);
  }else if(recovery&&value.status!=='active')setCompletionLive(false);
  anchor.current={server:value.serverAt,local:performance.now()};state.current=value;setSnapshot(value);setNow(value.serverAt);setError('');
 },[runId]);
 const refresh=useCallback(async(recovery=false)=>{
  const current=generation.current,requestEpoch=epoch.current;
  try{const value=await arcadeRequest<T>({op:'state',runId});if(current===generation.current)accept(value,recovery,requestEpoch);}
  catch(e){if(current===generation.current){interrupt();setError(e instanceof Error?e.message:'Connection lost.');}}
 },[runId,accept,interrupt]);
 useEffect(()=>{
  generation.current++;state.current=null;initial.current=true;finishedSeen.current=false;busy.current=false;setSnapshot(null);setPending(false);setCompletedOnEntry(false);setCompletionLive(false);
  void refresh(true);
  const channel=supabase.channel('arcade:'+runId+':'+crypto.randomUUID()).on('postgres_changes',
   {event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+runId},()=>void refresh()).subscribe(status=>{if(status==='SUBSCRIBED')void refresh(true);else interrupt();});
  const recover=()=>{interrupt();void refresh(true);};
  const visible=()=>{interrupt();if(document.visibilityState==='visible')void refresh(true);};
  window.addEventListener('focus',recover);window.addEventListener('online',recover);window.addEventListener('offline',interrupt);document.addEventListener('visibilitychange',visible);
  let frame=0,last=0;const tick=(time:number)=>{if(time-last>=80){last=time;setNow(anchor.current.server+performance.now()-anchor.current.local);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{generation.current++;cancelAnimationFrame(frame);void supabase.removeChannel(channel);window.removeEventListener('focus',recover);window.removeEventListener('online',recover);window.removeEventListener('offline',interrupt);document.removeEventListener('visibilitychange',visible);};
 },[runId,refresh,interrupt]);
 // A single fetch at the persisted boundary keeps connected intros timely.
 // This never advances local state; the independent worker owns zero-client recovery.
 useEffect(()=>{
  if(snapshot?.dueAt==null)return;
  const remaining=snapshot.dueAt-(anchor.current.server+performance.now()-anchor.current.local);
  const timer=setTimeout(()=>void refresh(),Math.max(0,remaining)+25);
  return()=>clearTimeout(timer);
 },[snapshot?.revision,snapshot?.dueAt,refresh]);
 const act=useCallback(async(intent:ArcadeRunIntent)=>{
  const current=state.current;if(!current||busy.current)return;
  busy.current=true;setPending(true);const scope=generation.current,requestEpoch=epoch.current;
  try{const value=await arcadeRequest<T>({op:'action',runId,requestId:crypto.randomUUID(),revision:current.revision,roundId:current.view.roundId,intent});if(scope===generation.current)accept(value,false,requestEpoch);}
  catch(e){if(scope===generation.current){interrupt();await refresh(true);setError(e instanceof Error?e.message:'Action failed.');}}
  finally{if(scope===generation.current){busy.current=false;setPending(false);}}
 },[runId,accept,refresh,interrupt]);
 return {snapshot,error,pending,now,act,refresh,completedOnEntry,completionLive};
}

