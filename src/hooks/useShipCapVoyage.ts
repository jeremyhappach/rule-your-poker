import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,retireAcknowledgedCommand,scheduleAuthoritativeBoundary} from '@/lib/authoritativeSubscription';
import type {VoyageTransport} from '@/lib/shipCapVoyage/client';
import type {VoyageAction,VoyageCommand,VoyageSnapshot} from '@/lib/shipCapVoyage/model';
export function useShipCapVoyage(id:string,userId:string,transport:VoyageTransport,liveEntry:boolean){
 const [snapshot,setSnapshot]=useState<VoyageSnapshot|null>(null),[now,setNow]=useState(0),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [liveRevision,setLiveRevision]=useState(-1),[cue,setCue]=useState<{command:VoyageCommand;snapshot:VoyageSnapshot}|null>(null),[roundCue,setRoundCue]=useState<string|null>(null);
 const [recoveryEpoch,setRecoveryEpoch]=useState(0);
 const [uncertain,setUncertain]=useState(false);
 const latest=useRef<VoyageSnapshot|null>(null),clock=useRef({at:0,local:0}),mounted=useRef(false),busy=useRef(false),epoch=useRef(0),bornEnded=useRef(false);
 const lane=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null),key='ptown:ship-cap-voyage:1:'+userId+':'+id;
 const accept=useCallback((next:VoyageSnapshot,recovering:boolean)=>{
  if(!mounted.current||next.id!==id)return false;
  const prev=latest.current;if(prev&&next.revision<prev.revision)return false;
  if(prev&&next.revision===prev.revision){if(JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prev,serverAt:0}))return false;if(next.serverAt<=prev.serverAt)return true;}
  if(!prev)bornEnded.current=next.status!=='active';
  const local=performance.now(),at=prev?Math.max(next.serverAt,clock.current.at+local-clock.current.local):next.serverAt;
  if(!recovering&&!document.hidden&&(prev||liveEntry)&&next.revision!==prev?.revision){setLiveRevision(next.revision);
   if(next.status==='active'&&next.phase==='playing'&&next.roundId!==prev?.roundId)setRoundCue(next.roundId);
  }
  latest.current=next;clock.current={at,local};setSnapshot(next);setNow(at);setError('');return true;
 },[id,liveEntry]);
 const submit=useCallback(async(live=false)=>{
  const saved=sessionStorage.getItem(key);if(!saved||busy.current)return;
  busy.current=true;setPending(true);const ticket=epoch.current;
  try {const command=JSON.parse(saved) as VoyageCommand,value=await transport.send(command);retireAcknowledgedCommand(key,saved);
   if(mounted.current){setUncertain(false);const fresh=live&&ticket===epoch.current;accept(value,!fresh);if(fresh&&value.revision===command.revision+1)setCue({command,snapshot:value});}
  }catch(e){const definitive=!!(e as {definitive?:boolean}).definitive;if(definitive)retireAcknowledgedCommand(key,saved);if(mounted.current){setUncertain(!definitive);setError((e as Error).message);void lane.current?.refresh();}}
  finally{busy.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;
  const subscription=createAuthoritativeSubscription({subscribe:transport.subscribe,load:transport.load,apply:accept,connected:setReady,error:e=>setError((e as Error).message),
   interrupt:()=>{epoch.current++;setRecoveryEpoch(x=>x+1);setLiveRevision(-1);setCue(null);setRoundCue(null);},recoverPending:()=>submit()});lane.current=subscription;
  const tick=setInterval(()=>{if(!document.hidden)setNow(clock.current.at+performance.now()-clock.current.local);},60);
  return()=>{mounted.current=false;epoch.current++;clearInterval(tick);subscription.dispose();lane.current=null;};
 },[transport,accept,submit]);
 const due=snapshot?.status==='active'?snapshot.dueAt:null;
 useEffect(()=>{if(due!=null)return scheduleAuthoritativeBoundary(due-clock.current.at-performance.now()+clock.current.local,()=>lane.current?.refresh());},[due]);
 function act(type:VoyageAction,items:number[]=[]){const v=latest.current;if(!v||v.status!=='active'||!lane.current?.isReady()||busy.current||sessionStorage.getItem(key))return;
  if(type!=='abandon'&&(type==='next_round'?v.phase!=='summary':v.phase!=='playing'))return;
  const command:VoyageCommand={requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,intent:{type,items}};
  sessionStorage.setItem(key,JSON.stringify(command));void submit(true);return command;
 }
 return {snapshot,now,recoveryEpoch,ready,pending,error:error||(uncertain?'Reconnect to confirm your last move.':''),liveRevision,cue,roundCue,act,bornEnded:bornEnded.current,reconnect:()=>void lane.current?.recover()};
}
