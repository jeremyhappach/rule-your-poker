import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from '@/lib/authoritativeSubscription';
import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptElevenSnapshot,type ElevenIntent,type ElevenSnapshot} from '@/lib/elevenUp/model';
export interface ElevenCommand {requestId:string;revision:number;scope:string;intent:ElevenIntent}
export interface ElevenTransport {load:()=>Promise<ElevenSnapshot>;send:(command:ElevenCommand)=>Promise<ElevenSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
/** One immutable pending command. Display clocks never advance authoritative play. */
export function useElevenUp(id:string,userId:string,transport:ElevenTransport){
 const [snapshot,setSnapshot]=useState<ElevenSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0),[epoch,setEpoch]=useState(0),[connected,setConnected]=useState(false);
 const latest=useRef<ElevenSnapshot|null>(null),flight=useRef(false),mounted=useRef(false),generation=useRef(0),scope=useRef(id),clock=useRef({server:0,local:0});scope.current=id;
 const recoveryRef=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null);
 const key=`ptown:eleven-up:1:${userId}:${id}`;
 const accept=useCallback((v:ElevenSnapshot,token:number)=>{if(!mounted.current||scope.current!==id||token!==generation.current)return;const next=acceptElevenSnapshot(latest.current,v,id);if(next!==v)return;latest.current=next;setSnapshot(next);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');},[id]);
 const resolve=useCallback(async()=>{
  if(flight.current)return;const token=generation.current;flight.current=true;setPending(true);
  try{
   const saved=sessionStorage.getItem(key);
   if(saved){const command=JSON.parse(saved) as ElevenCommand;
    try{accept(await transport.send(command),token);if(token===generation.current)retireAcknowledgedCommand(key,saved);}
    catch(e){
     // Definitive server rejection retires this intent. Network uncertainty keeps
     // exactly the same UUID/payload across reload; never mint a replacement.
     if(/stale|inactive|phase|illegal|sum|covered|pass_unavailable|invalid_group|database_rejected/.test((e as Error).message)){if(token===generation.current)retireAcknowledgedCommand(key,saved);accept(await transport.load(),token);}
     else throw e;
    }
   }else accept(await transport.load(),token);
  }catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{if(token===generation.current){flight.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;const token=++generation.current;flight.current=false;latest.current=null;setSnapshot(null);setConnected(false);
  const recovery=createAuthoritativeSubscription({isPaused:()=>!!latest.current?.paused,subscribe:transport.subscribe,load:transport.load,apply:(v,recovering)=>{accept(v,token);if(latest.current!==v)return false;if(recovering)setEpoch(n=>n+1);return true;},connected:setConnected,error:e=>setError((e as Error).message),interrupt:()=>setEpoch(n=>n+1),recoverPending:async()=>{if(sessionStorage.getItem(key))await resolve();}});recoveryRef.current=recovery;
  const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  return()=>{mounted.current=false;generation.current++;recovery.dispose();clearInterval(timer);};
 },[transport,accept,resolve]);
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished||snapshot.board.phase==='complete')return;
  const at=clock.current.server+performance.now()-clock.current.local;
  return scheduleAuthoritativeBoundary(snapshot.board.deadline-at,()=>recoveryRef.current?.refresh());
 },[snapshot?.scope,snapshot?.board.deadline,snapshot?.board.phase,snapshot?.paused,snapshot?.finished]);
 const act=async(intent:ElevenIntent)=>{
  const v=latest.current;if(!v||!connected||!recoveryRef.current?.isReady()||flight.current||sessionStorage.getItem(key)||document.hidden||!navigator.onLine)return;
  if(intent.type==='reclaim'){
   if(v.solo||v.finished||v.settled||!v.players.some(p=>p.id===v.viewerId&&p.autoplay))return;
  }else if(!v.canAct||v.paused||intent.type!=='abandon'&&now>=v.board.deadline)return;
  const command:ElevenCommand={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await resolve();
 };
 return {snapshot,error:error||(!connected?'Reconnecting…':''),pending,now,epoch,act,reconnect:()=>{void recoveryRef.current?.recover();}};
}
