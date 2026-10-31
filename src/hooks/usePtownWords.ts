import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from '@/lib/authoritativeSubscription';
import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptWordsSnapshot,type WordsSnapshot,type Intent} from '@/lib/ptownWords/model';
import type {Command,WordsTransport} from '@/lib/ptownWords/client';
/** Pending UUID/payload survives uncertain replies. No client advances a turn. */
export function usePtownWords(id:string,userId:string,transport:WordsTransport,storageScope='ptown:words:1'){
 const [snapshot,setSnapshot]=useState<WordsSnapshot|null>(null),[error,setError]=useState(''),[errorVersion,setErrorVersion]=useState(0),[pending,setPending]=useState(false),[connected,setConnected]=useState(false),[now,setNow]=useState(0);
 const latest=useRef<WordsSnapshot|null>(null),generation=useRef(0),flight=useRef(false),clock=useRef({server:0,local:0});
 const recoveryRef=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null);
 const key=`${storageScope}:${userId}:${id}`;
 const accept=useCallback((v:WordsSnapshot,token:number)=>{if(token!==generation.current||latest.current&&v.revision<latest.current.revision)return;const next=acceptWordsSnapshot(latest.current,v,id),local=performance.now(),server=latest.current?Math.max(next.serverAt,clock.current.server+local-clock.current.local):next.serverAt;latest.current=next;setSnapshot(next);clock.current={server,local};setNow(server);},[id]);
 const resolve=useCallback(async()=>{if(flight.current)return false;const token=generation.current;flight.current=true;let ok=false;
  try{const saved=sessionStorage.getItem(key);setPending(!!saved);if(saved){try{accept(await transport.send(JSON.parse(saved) as Command),token);if(token===generation.current)retireAcknowledgedCommand(key,saved);setError('');ok=true;}catch(e){if(/ptown_words:|42501/.test((e as Error).message)){if(token===generation.current)retireAcknowledgedCommand(key,saved);accept(await transport.load(),token);}throw e;}}
   else{accept(await transport.load(),token);setError('');ok=true;}
  }catch(e){if(token===generation.current){setError((e as Error).message);setErrorVersion(n=>n+1);}}finally{if(token===generation.current){flight.current=false;setPending(!!sessionStorage.getItem(key));}}return ok;
 },[key,transport,accept]);
 useEffect(()=>{const token=++generation.current;latest.current=null;flight.current=false;setSnapshot(null);setConnected(false);setError('');
  const recovery=createAuthoritativeSubscription({isPaused:()=>!!latest.current?.paused,subscribe:transport.subscribe,load:transport.load,apply:v=>{accept(v,token);if(latest.current!==v)return false;setError('');return true;},connected:setConnected,error:e=>setError((e as Error).message),interrupt:()=>{},recoverPending:async()=>{if(sessionStorage.getItem(key))await resolve();}});recoveryRef.current=recovery;
  const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  return()=>{generation.current++;recovery.dispose();clearInterval(timer);};
 },[transport,accept,resolve]);
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished||snapshot.phase==='complete')return;
  const at=clock.current.server+performance.now()-clock.current.local;
  return scheduleAuthoritativeBoundary(snapshot.deadline-at,()=>recoveryRef.current?.refresh());
 },[snapshot?.identity.roundId,snapshot?.deadline,snapshot?.phase,snapshot?.paused,snapshot?.finished]);
 const act=async(intent:Intent)=>{const v=latest.current;if(!v||(!['request_pause','cancel_pause_request'].includes(intent.type)&&!v.canAct)||v.paused||!connected||!recoveryRef.current?.isReady()||flight.current||sessionStorage.getItem(key)||!navigator.onLine||document.hidden)return false;sessionStorage.setItem(key,JSON.stringify({requestId:crypto.randomUUID(),revision:v.revision,intent}));return resolve();};
 return {snapshot,error,errorVersion,pending,connected,now,act,reconnect:()=>recoveryRef.current?.recover()??Promise.resolve(false)};
}
