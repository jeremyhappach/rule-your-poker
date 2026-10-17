import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ArcadeRunIntent,ArcadeSnapshot,ArcadeRunSnapshot} from '@/lib/arcade/model';
import type {TriArcadeSnapshot} from '@/lib/arcade/model';
import {useTriIntentBuffer} from './useTriIntentBuffer';
import {triTiming} from '@/lib/triTowers/diagnostics';
export function useArcadeRun<T extends ArcadeRunSnapshot=ArcadeSnapshot>(runId:string,trackRoundPresentation=false){
 const [snapshot,setSnapshot]=useState<T|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [now,setNow]=useState(0),state=useRef<T|null>(null),generation=useRef(0),busy=useRef(false);
 const anchor=useRef({server:0,local:0}),initial=useRef(true),[completedOnEntry,setCompletedOnEntry]=useState(false);
 const [completionLive,setCompletionLive]=useState(false),epoch=useRef(0),finishedSeen=useRef(false);
 const [presentationEpoch,setPresentationEpoch]=useState(0);
 const interruptInput=useRef(()=>{});
 const interrupt=useCallback(()=>{epoch.current++;if(trackRoundPresentation){setPresentationEpoch(n=>n+1);interruptInput.current();}setCompletionLive(false);},[trackRoundPresentation]);
 const accept=useCallback((value:T,recovery=false,requestEpoch=epoch.current)=>{
  if(value.id!==runId)return;
  const previous=state.current;
  if(previous&&value.revision<previous.revision)return;
  if(previous&&value.revision===previous.revision&&JSON.stringify(value.view)!==JSON.stringify(previous.view)){
   setError('State changed unexpectedly. Reconnect to verify your run.');return;
  }
  // Tag the recovered response as well as the interruption. An old playing frame
  // may remain mounted while the recovery fetch is in flight.
  if(trackRoundPresentation&&previous&&value.revision>previous.revision&&(recovery||requestEpoch!==epoch.current))setPresentationEpoch(n=>n+1);
  if(initial.current){setCompletedOnEntry(value.status!=='active');initial.current=false;}
  if(value.status==='completed'&&!finishedSeen.current){
   finishedSeen.current=true;
   const key='arcade-completion:'+value.id;
   let seen=false;try{seen=sessionStorage.getItem(key)==='1';sessionStorage.setItem(key,'1');}catch{/* Initial-load suppression remains. */}
   setCompletionLive(!seen&&!recovery&&requestEpoch===epoch.current&&!document.hidden&&previous?.status==='active'&&
    !!value.view.scorePresentation&&value.serverAt<value.view.scorePresentation.endsAt);
  }else if(recovery&&value.status!=='active')setCompletionLive(false);
  anchor.current={server:value.serverAt,local:performance.now()};state.current=value;setSnapshot(value);setNow(value.serverAt);setError('');
 },[runId,trackRoundPresentation]);
 const refresh=useCallback(async(recovery=false)=>{
  const current=generation.current,requestEpoch=epoch.current;
  try{const value=await arcadeRequest<T>({op:'state',runId,...(trackRoundPresentation?{game:'tri-towers'}:{})});if(current===generation.current)accept(value,recovery,requestEpoch);}
  catch(e){if(current===generation.current){interrupt();setError(e instanceof Error?e.message:'Connection lost.');}}
 },[runId,accept,interrupt,trackRoundPresentation]);
 const intentView=(value:T|null)=>{if(!trackRoundPresentation||!value)return null;const s=value as unknown as TriArcadeSnapshot,v=s.view;if(v.rules?.version!=='tri-towers/3')return null;return {scope:runId+':'+v.roundId,actor:runId,roundId:v.roundId,revision:s.revision,phase:v.phase,waste:v.waste,cards:v.cards,removed:v.removed,allowed:s.status==='active'&&!error&&!document.hidden&&navigator.onLine&&anchor.current.server+performance.now()-anchor.current.local<v.deadline};};
 const buffer=useTriIntentBuffer('arcade:'+runId,()=>intentView(state.current),async command=>{
  const scope=generation.current,requestEpoch=epoch.current;
  try{const value=await arcadeRequest<T>({op:'action',game:'tri-towers',runId,requestId:command.requestId,revision:command.revision,roundId:command.roundId,intent:command.intent});
   if(scope===generation.current){accept(value,false,requestEpoch);triTiming('snapshot-accepted',command.requestId,undefined,value.view.roundId+':'+value.revision);}
   return intentView(value)!;
  }catch(e){if(scope===generation.current)await refresh(true);throw e;}
 },trackRoundPresentation);
 const bufferRef=useRef(buffer);bufferRef.current=buffer;
 interruptInput.current=()=>buffer.interrupt();
 useEffect(()=>{
  generation.current++;const currentGeneration=generation.current;state.current=null;initial.current=true;finishedSeen.current=false;busy.current=false;setSnapshot(null);setPending(false);setCompletedOnEntry(false);setCompletionLive(false);setPresentationEpoch(0);
  void refresh(true);
  const channel=supabase.channel('arcade:'+runId+':'+crypto.randomUUID()).on('postgres_changes',
   {event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+runId},()=>{if(!trackRoundPresentation||currentGeneration===generation.current)void refresh();}).subscribe(status=>{if(trackRoundPresentation&&currentGeneration!==generation.current)return;if(status==='SUBSCRIBED')void refresh(true);else interrupt();});
  const recover=()=>{interrupt();if(trackRoundPresentation){bufferRef.current.interrupt();void bufferRef.current.recover().then(()=>refresh(true));}else void refresh(true);};
  const visible=()=>{interrupt();if(trackRoundPresentation)bufferRef.current.interrupt();if(document.visibilityState==='visible'){if(trackRoundPresentation)void bufferRef.current.recover().then(()=>refresh(true));else void refresh(true);}};
  window.addEventListener('focus',recover);window.addEventListener('online',recover);window.addEventListener('offline',interrupt);document.addEventListener('visibilitychange',visible);
  let frame=0,last=0;const tick=(time:number)=>{if(time-last>=80){last=time;setNow(anchor.current.server+performance.now()-anchor.current.local);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  return()=>{generation.current++;cancelAnimationFrame(frame);void supabase.removeChannel(channel);window.removeEventListener('focus',recover);window.removeEventListener('online',recover);window.removeEventListener('offline',interrupt);document.removeEventListener('visibilitychange',visible);};
 },[runId,refresh,interrupt,trackRoundPresentation]);
 // A single fetch at the persisted boundary keeps connected intros timely.
 // This never advances local state; the independent worker owns zero-client recovery.
 useEffect(()=>{
  if(snapshot?.dueAt==null)return;
  const remaining=snapshot.dueAt-(anchor.current.server+performance.now()-anchor.current.local);
  const timer=setTimeout(()=>void refresh(),Math.max(0,remaining)+25);
  return()=>clearTimeout(timer);
 },[snapshot?.revision,snapshot?.dueAt,refresh]);
 const act=useCallback(async(intent:ArcadeRunIntent)=>{
  if(trackRoundPresentation&&intentView(state.current)){buffer.enqueue(intent as import('@/lib/triTowers/intentBuffer').BufferedIntent);return;}
  const current=state.current;if(!current||busy.current)return;
  busy.current=true;setPending(true);const scope=generation.current,requestEpoch=epoch.current;
  try{const value=await arcadeRequest<T>({op:'action',runId,requestId:crypto.randomUUID(),revision:current.revision,roundId:current.view.roundId,intent});if(scope===generation.current)accept(value,false,requestEpoch);}
  catch(e){if(scope===generation.current){interrupt();await refresh(true);setError(e instanceof Error?e.message:'Action failed.');}}
  finally{if(scope===generation.current){busy.current=false;setPending(false);}}
 },[runId,accept,refresh,interrupt,trackRoundPresentation,buffer]);
 const input=intentView(snapshot)?buffer:undefined;
 return {snapshot,error,pending:pending||!!input?.busy,now,act,refresh,completedOnEntry,completionLive,presentationEpoch,interruptPresentation:interrupt,input,recoverInput:async()=>{buffer.interrupt();await buffer.recover();await refresh(true);}};
}

