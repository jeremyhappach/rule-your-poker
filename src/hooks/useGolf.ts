import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from '@/lib/authoritativeSubscription';
import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptGolfSnapshot,golfPlayWindow,type GolfIntent,type GolfSnapshot} from '@/lib/golf/model';
export interface GolfCommand {requestId:string;revision:number;scope:string;intent:GolfIntent}
export interface GolfTransport {load:()=>Promise<GolfSnapshot>;send:(command:GolfCommand)=>Promise<GolfSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
/** One immutable pending command. Display clocks never advance authoritative play. */
export function useGolf(id:string,userId:string,transport:GolfTransport){
 const [snapshot,setSnapshot]=useState<GolfSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0),[epoch,setEpoch]=useState(0),[connected,setConnected]=useState<boolean|null>(null);
 const latest=useRef<GolfSnapshot|null>(null),flight=useRef(false),mounted=useRef(false),generation=useRef(0),scope=useRef(id),clock=useRef({server:0,local:0});scope.current=id;
 const recoveryRef=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null);
 const key=`ptown:golf:1:${userId}:${id}`;
 const accept=useCallback((v:GolfSnapshot,token:number)=>{if(!mounted.current||scope.current!==id||token!==generation.current)return;const next=acceptGolfSnapshot(latest.current,v,id);if(next!==v)return;latest.current=next;setSnapshot(next);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');},[id]);
 const resolve=useCallback(async()=>{
  if(flight.current)return;const token=generation.current,saved=sessionStorage.getItem(key);
  if(!saved){try{accept(await transport.load(),token);}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}return;}
  flight.current=true;
  try{
   if(saved){setPending(true);const command=JSON.parse(saved) as GolfCommand;
    try{accept(await transport.send(command),token);if(token===generation.current)retireAcknowledgedCommand(key,saved);}
    catch(e){
     // Definitive server rejection retires this intent. Network uncertainty keeps
     // exactly the same UUID/payload across reload; never mint a replacement.
     if(/golf:deadline|golf:not_actor|golf:identity|golf:paused|golf:autoplay_active|stale|inactive|phase|illegal|stock_empty|invalid_command|invalid_action|database_rejected/.test((e as Error).message)){if(token===generation.current)retireAcknowledgedCommand(key,saved);accept(await transport.load(),token);}
     else throw e;
    }
   }else accept(await transport.load(),token);
  }catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{if(token===generation.current){flight.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;const token=++generation.current;flight.current=false;latest.current=null;setSnapshot(null);setConnected(null);setError('');setPending(false);
  const recovery=createAuthoritativeSubscription({isPaused:()=>!!latest.current?.paused,subscribe:transport.subscribe,load:transport.load,apply:(v,recovering)=>{accept(v,token);if(latest.current!==v)return false;if(recovering)setEpoch(n=>n+1);return true;},connected:setConnected,error:e=>setError((e as Error).message),interrupt:()=>setEpoch(n=>n+1),recoverPending:async()=>{if(sessionStorage.getItem(key))await resolve();}});recoveryRef.current=recovery;
  let timer:ReturnType<typeof setTimeout>,frame:number;
  const tick=()=>{setNow(clock.current.server+performance.now()-clock.current.local);if(latest.current?.phase==='hole_complete'&&!document.hidden)frame=requestAnimationFrame(tick);else timer=setTimeout(tick,100);};tick();
  return()=>{mounted.current=false;generation.current++;recovery.dispose();clearTimeout(timer);cancelAnimationFrame(frame);};
 },[transport,accept,resolve]);
 // Bounded authoritative reads at the persisted boundary; never local advance.
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished||snapshot.phase==='complete')return;
  const deadline=snapshot.deadline,at=clock.current.server+performance.now()-clock.current.local;
  return scheduleAuthoritativeBoundary(deadline-at,()=>recoveryRef.current?.refresh());
 },[snapshot?.scope,snapshot?.deadline,snapshot?.phase,snapshot?.paused,snapshot?.finished,resolve]);
 const act=async(intent:GolfIntent)=>{
  const v=latest.current,at=clock.current.server+performance.now()-clock.current.local;if(!v||!connected||!recoveryRef.current?.isReady()||flight.current||sessionStorage.getItem(key)||!v.canAct||v.paused||document.hidden||!navigator.onLine||!golfPlayWindow(v,at).playable)return;
  const command:GolfCommand={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await resolve();
 };
 return {snapshot:snapshot?.id===id?snapshot:null,error:error||(connected===false?'Connection interrupted. Reconnecting…':''),connected:connected===true,pending,now,epoch,act,reconnect:()=>{void recoveryRef.current?.recover();}};
}
