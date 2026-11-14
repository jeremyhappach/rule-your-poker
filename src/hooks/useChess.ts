import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from '@/lib/authoritativeSubscription';
import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptChessSnapshot,type ChessSnapshot} from '@/lib/chess/client';
import type {ChessIntent as Intent} from '@/lib/chess/rules';
import type {Command,ChessTransport} from '@/lib/chess/client';
/** Pending UUID/payload survives uncertain replies. No client advances a turn. */
export function useChess(id:string,userId:string,transport:ChessTransport,storageScope='ptown:chess:1'){
 const [snapshot,setSnapshot]=useState<ChessSnapshot|null>(null),[error,setError]=useState(''),[errorVersion,setErrorVersion]=useState(0),[pending,setPending]=useState(false),[connected,setConnected]=useState(false),[now,setNow]=useState(0);
 const latest=useRef<ChessSnapshot|null>(null),generation=useRef(0),flight=useRef<AbortController|null>(null),clock=useRef({server:0,local:0});
 const recoveryRef=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null);
 const key=`${storageScope}:${userId}:${id}`;
 const accept=useCallback((v:ChessSnapshot,token:number)=>{if(token!==generation.current||latest.current&&v.revision<latest.current.revision)return;const next=acceptChessSnapshot(latest.current,v,id),local=performance.now(),server=latest.current?Math.max(next.serverAt,clock.current.server+local-clock.current.local):next.serverAt;latest.current=next;setSnapshot(next);clock.current={server,local};setNow(server);},[id]);
 const resolve=useCallback(async(freshId?:string)=>{if(flight.current)return false;const token=generation.current,controller=new AbortController();flight.current=controller;let ok=false;
  const interrupted=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Connection uncertain. Reconnect to retry.')),{once:true}));
  const timeout=setTimeout(()=>controller.abort(),10000);
  const send=(command:Command)=>Promise.race([transport.send(command,controller.signal),interrupted]);
  const load=()=>Promise.race([transport.load(),interrupted]);
  try{const saved=sessionStorage.getItem(key);setPending(!!saved);if(saved){try{const command=JSON.parse(saved) as Command;
    const response=await send(command);
    accept(response,token);
    if(freshId!==command.requestId||response.revision<=command.revision||latest.current!==response)accept(await load(),token);
    if(token===generation.current)retireAcknowledgedCommand(key,saved);setError('');ok=true;}catch(e){if(/chess:|42501/.test((e as Error).message)){if(token===generation.current)retireAcknowledgedCommand(key,saved);accept(await load(),token);}throw e;}}
   else{accept(await load(),token);setError('');ok=true;}
  }catch(e){if(token===generation.current&&flight.current===controller){setError((e as Error).message);setErrorVersion(n=>n+1);}}finally{clearTimeout(timeout);if(token===generation.current&&flight.current===controller){flight.current=null;setPending(!!sessionStorage.getItem(key));}}return ok;
 },[key,transport,accept]);
 useEffect(()=>{const token=++generation.current;latest.current=null;flight.current=null;setSnapshot(null);setConnected(false);setError('');
  const interrupt=()=>{flight.current?.abort();flight.current=null;};
  const recovery=createAuthoritativeSubscription({isPaused:()=>!!latest.current?.paused,subscribe:transport.subscribe,load:transport.load,apply:v=>{accept(v,token);if(latest.current!==v)return false;setError('');return true;},connected:setConnected,error:e=>setError((e as Error).message),interrupt,recoverPending:async()=>{if(sessionStorage.getItem(key))await resolve();}});recoveryRef.current=recovery;
  const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  const restored=()=>{void recovery.recover(true);};window.addEventListener('pageshow',restored);
  return()=>{generation.current++;interrupt();recovery.dispose();clearInterval(timer);window.removeEventListener('pageshow',restored);};
 },[transport,accept,resolve]);
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished)return;
  const at=clock.current.server+performance.now()-clock.current.local;
  return scheduleAuthoritativeBoundary((snapshot.terminal?.deadline??snapshot.deadline)-at,()=>recoveryRef.current?.refresh());
 },[snapshot?.identity.roundId,snapshot?.deadline,snapshot?.phase,snapshot?.terminal?.deadline,snapshot?.paused,snapshot?.finished]);
 const act=async(intent:Intent,expectedRevision?:number)=>{const v=latest.current;if(!v||(expectedRevision!==undefined&&v.revision!==expectedRevision)||(!['request_pause','cancel_pause_request'].includes(intent.type)&&!v.canAct)||v.paused||!connected||!recoveryRef.current?.isReady()||flight.current||sessionStorage.getItem(key)||!navigator.onLine||document.hidden)return false;const requestId=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({requestId,revision:v.revision,intent}));return resolve(requestId);};
 return {snapshot,error,errorVersion,pending,connected,now,act,reconnect:()=>recoveryRef.current?.recover()??Promise.resolve(false)};
}
