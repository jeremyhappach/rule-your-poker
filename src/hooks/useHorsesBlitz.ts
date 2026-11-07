import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,retireAcknowledgedCommand,scheduleAuthoritativeBoundary} from '@/lib/authoritativeSubscription';
import type {BlitzTransport} from '@/lib/horsesBlitz/client';
import type {BlitzAction,BlitzCommand,BlitzSnapshot} from '@/lib/horsesBlitz/model';
export function useHorsesBlitz(id:string,userId:string,transport:BlitzTransport,liveEntry:boolean){
 const [snapshot,setSnapshot]=useState<BlitzSnapshot|null>(null),[now,setNow]=useState(0),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [liveRevision,setLiveRevision]=useState(-1),[cue,setCue]=useState<BlitzCommand|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const latest=useRef<BlitzSnapshot|null>(null),clock=useRef({at:0,local:0}),mounted=useRef(false),busy=useRef(false),epoch=useRef(0),bornEnded=useRef(false);
 const lane=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null),key='ptown:horses-blitz:1:'+userId+':'+id;
 const accept=useCallback((next:BlitzSnapshot,recovering:boolean)=>{
  if(!mounted.current||next.id!==id)return false;
  const prev=latest.current;if(prev&&next.revision<prev.revision)return false;
  if(prev&&next.revision===prev.revision){if(JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prev,serverAt:0}))return false;if(next.serverAt<=prev.serverAt)return true;}
  if(!prev)bornEnded.current=next.status!=='active';
  const local=performance.now(),at=prev?Math.max(next.serverAt,clock.current.at+local-clock.current.local):next.serverAt;
  if(!recovering&&!document.hidden&&(prev||liveEntry)&&next.revision!==prev?.revision){setLiveRevision(next.revision);
  }
  latest.current=next;clock.current={at,local};setSnapshot(next);setNow(at);setError('');return true;
 },[id,liveEntry]);
 const submit=useCallback(async(live=false)=>{
  const saved=sessionStorage.getItem(key);if(!saved||busy.current)return;
  busy.current=true;setPending(true);const ticket=epoch.current;
  try {const command=JSON.parse(saved) as BlitzCommand,value=await transport.send(command);retireAcknowledgedCommand(key,saved);
   if(mounted.current){setUncertain(false);const fresh=live&&ticket===epoch.current;accept(value,!fresh);if(fresh&&value.revision===command.revision+1)setCue(command);}
  }catch(e){const definitive=!!(e as {definitive?:boolean}).definitive;if(definitive)retireAcknowledgedCommand(key,saved);if(mounted.current){setUncertain(!definitive);setError((e as Error).message);void lane.current?.refresh();}}
  finally{busy.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;
  const subscription=createAuthoritativeSubscription({subscribe:transport.subscribe,load:transport.load,apply:accept,connected:setReady,error:e=>setError((e as Error).message),
   interrupt:()=>{epoch.current++;setLiveRevision(-1);setCue(null);},recoverPending:()=>submit()});lane.current=subscription;
  const tick=setInterval(()=>{if(!document.hidden)setNow(clock.current.at+performance.now()-clock.current.local);},60);
  return()=>{mounted.current=false;epoch.current++;clearInterval(tick);subscription.dispose();lane.current=null;};
 },[transport,accept,submit]);
 const due=snapshot?.status==='active'?snapshot.dueAt:null;
 useEffect(()=>{if(due!=null)return scheduleAuthoritativeBoundary(due-clock.current.at-performance.now()+clock.current.local,()=>lane.current?.refresh());},[due]);
 function act(type:BlitzAction,items:number[]=[]){const v=latest.current;if(!v||v.status!=='active'||!lane.current?.isReady()||busy.current||sessionStorage.getItem(key))return;
  if(type!=='abandon'&&(type==='next_round'?v.phase!=='summary':v.phase!=='playing'||v.deadline===null||clock.current.at+performance.now()-clock.current.local>=v.deadline))return;
  sessionStorage.setItem(key,JSON.stringify({requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,intent:{type,items}}));void submit(true);
 }
 return {snapshot,now,ready,pending,error:error||(uncertain?'Reconnect to confirm your last move.':''),liveRevision,cue,act,bornEnded:bornEnded.current,reconnect:()=>void lane.current?.recover()};
}
