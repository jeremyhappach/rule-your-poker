import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,retireAcknowledgedCommand,scheduleAuthoritativeBoundary} from '@/lib/authoritativeSubscription';
import type {DropTransport} from '@/lib/drop357/client';
import type {DropAction,DropCommand,DropSnapshot} from '@/lib/drop357/model';
export function useDrop357(id:string,userId:string,transport:DropTransport,liveEntry:boolean){
 const [snapshot,setSnapshot]=useState<DropSnapshot|null>(null),[now,setNow]=useState(0),[ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [liveRevision,setLiveRevision]=useState(-1),[cue,setCue]=useState<DropCommand|null>(null);
 const [liveLanes,setLiveLanes]=useState<number[]>([]);
 const [placement,setPlacement]=useState<{roundId:string;revision:number;lane:number;slot:number;card:number}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const [recoveryEpoch,setRecoveryEpoch]=useState(0);
 const latest=useRef<DropSnapshot|null>(null),clock=useRef({at:0,local:0}),mounted=useRef(false),sending=useRef(new Set<string>()),epoch=useRef(0),bornEnded=useRef(false);
 const lane=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null),key='ptown:357-drop:1:'+userId+':'+id;
 const accept=useCallback((next:DropSnapshot,recovering:boolean)=>{
  if(!mounted.current||next.id!==id)return false;
  const prev=latest.current;if(prev&&next.revision<prev.revision)return false;
  if(prev&&next.revision===prev.revision){if(JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prev,serverAt:0}))return false;if(next.serverAt<=prev.serverAt)return true;}
  const saved=sessionStorage.getItem(key);
  if(saved){const command=JSON.parse(saved) as DropCommand;
   if(next.acceptedRequestId===command.requestId&&next.revision===command.revision+1){
    retireAcknowledgedCommand(key,saved);setPending(false);setPlacement(null);setUncertain(false);
    if(!recovering&&!document.hidden)setCue(command);
   }
  }
  if(!prev)bornEnded.current=next.status!=='active';
  const local=performance.now(),at=prev?Math.max(next.serverAt,clock.current.at+local-clock.current.local):next.serverAt;
  if(!recovering&&!document.hidden&&(prev||liveEntry)&&next.revision!==prev?.revision){setLiveRevision(next.revision);
   const newlyScored=next.laneResults.flatMap((r,i)=>r&&(prev?.roundId!==next.roundId||!prev?.laneResults[i])?[i]:[]);
   if(prev?.roundId!==next.roundId){setLiveLanes([]);setCue(null);}
   if(newlyScored.length)setLiveLanes(old=>[...new Set([...old,...newlyScored])]);
  }
  latest.current=next;clock.current={at,local};setSnapshot(next);setNow(at);setError('');return true;
 },[id,liveEntry,key]);
 const submit=useCallback(async(live=false)=>{
  const saved=sessionStorage.getItem(key);if(!saved||sending.current.has(saved))return;
  sending.current.add(saved);setPending(true);const ticket=epoch.current;
  try {const before=latest.current,command=JSON.parse(saved) as DropCommand,value=await transport.send(command);retireAcknowledgedCommand(key,saved);
   if(mounted.current){if(!sessionStorage.getItem(key)){setUncertain(false);setPlacement(null);}const fresh=live&&ticket===epoch.current;accept(value,!fresh);
    const moved=before&&value.roundId===command.roundId&&(command.intent.type==='place'?value.placements===before.placements+1:command.intent.type==='pass'?value.passesLeft===before.passesLeft-1:value.status==='abandoned');
    if(fresh&&moved&&value.revision===command.revision+1)setCue(command);}
  }catch(e){const stillPending=sessionStorage.getItem(key)===saved,definitive=!!(e as {definitive?:boolean}).definitive;if(definitive)retireAcknowledgedCommand(key,saved);if(mounted.current&&stillPending){setUncertain(!definitive);if(definitive)setPlacement(null);setError((e as Error).message);void lane.current?.refresh();}}
  finally{sending.current.delete(saved);if(mounted.current)setPending(!!sessionStorage.getItem(key));}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;
  const subscription=createAuthoritativeSubscription({subscribe:transport.subscribe,load:transport.load,apply:accept,connected:setReady,error:e=>setError((e as Error).message),
   interrupt:()=>{epoch.current++;setRecoveryEpoch(epoch.current);setLiveRevision(-1);setLiveLanes([]);setCue(null);},recoverPending:()=>submit()});lane.current=subscription;
  const tick=setInterval(()=>{if(!document.hidden)setNow(clock.current.at+performance.now()-clock.current.local);},60);
  return()=>{mounted.current=false;epoch.current++;clearInterval(tick);subscription.dispose();lane.current=null;};
 },[transport,accept,submit]);
 const due=snapshot?.status==='active'?snapshot.deadline:null;
 useEffect(()=>{if(due!==null)return scheduleAuthoritativeBoundary(due-clock.current.at-performance.now()+clock.current.local,()=>lane.current?.refresh());},[due]);
 function act(type:DropAction,items:number[]=[],displayedRevision?:number){const v=latest.current;if(!v||v.status!=='active'||!lane.current?.isReady()||sessionStorage.getItem(key))return;
  if(displayedRevision!==undefined&&displayedRevision!==v.revision)return;
  if(type!=='abandon'&&(v.phase!=='playing'||clock.current.at+performance.now()-clock.current.local>=v.deadline))return;
  if(type==='place'&&v.current!==null){const laneIndex=items[0],slot=items[1]??v.lanes[laneIndex].length;
   if(v.laneResults[laneIndex]||v.lanes[laneIndex][slot]!=null)return;
   setPlacement({roundId:v.roundId,revision:v.revision,lane:laneIndex,slot,card:v.current});
  }
  sessionStorage.setItem(key,JSON.stringify({requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,intent:{type,items}}));void submit(true);
 }
 return {snapshot,now,ready,pending,placement,error:error||(uncertain?'Reconnect to confirm your last move.':''),liveRevision,liveLanes,cue,act,recoveryEpoch,bornEnded:bornEnded.current,reconnect:()=>void lane.current?.recover()};
}
