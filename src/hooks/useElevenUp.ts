import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptElevenSnapshot,type ElevenIntent,type ElevenSnapshot} from '@/lib/elevenUp/model';
export interface ElevenCommand {requestId:string;revision:number;scope:string;intent:ElevenIntent}
export interface ElevenTransport {load:()=>Promise<ElevenSnapshot>;send:(command:ElevenCommand)=>Promise<ElevenSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
/** One immutable pending command. Display clocks never advance authoritative play. */
export function useElevenUp(id:string,userId:string,transport:ElevenTransport){
 const [snapshot,setSnapshot]=useState<ElevenSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0),[epoch,setEpoch]=useState(0),[connected,setConnected]=useState(false);
 const latest=useRef<ElevenSnapshot|null>(null),flight=useRef(false),mounted=useRef(false),generation=useRef(0),scope=useRef(id),clock=useRef({server:0,local:0});scope.current=id;
 const key=`ptown:eleven-up:1:${userId}:${id}`;
 const accept=useCallback((v:ElevenSnapshot,token:number)=>{if(!mounted.current||scope.current!==id||token!==generation.current)return;const next=acceptElevenSnapshot(latest.current,v,id);if(next!==v)return;latest.current=next;setSnapshot(next);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');},[id]);
 const resolve=useCallback(async()=>{
  if(flight.current)return;const token=generation.current;flight.current=true;setPending(true);
  try{
   const saved=sessionStorage.getItem(key);
   if(saved){const command=JSON.parse(saved) as ElevenCommand;
    try{accept(await transport.send(command),token);sessionStorage.removeItem(key);}
    catch(e){
     // Definitive server rejection retires this intent. Network uncertainty keeps
     // exactly the same UUID/payload across reload; never mint a replacement.
     if(/stale|inactive|phase|illegal|sum|covered|pass_unavailable|invalid_group|database_rejected/.test((e as Error).message)){sessionStorage.removeItem(key);accept(await transport.load(),token);}
     else throw e;
    }
   }else accept(await transport.load(),token);
  }catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{if(token===generation.current){flight.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;const token=++generation.current;flight.current=false;latest.current=null;setSnapshot(null);setConnected(false);
  let refreshing=false,dirty=false;
  const refresh=async()=>{dirty=true;if(refreshing)return;refreshing=true;try{while(dirty&&mounted.current&&token===generation.current){dirty=false;accept(await transport.load(),token);}}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{refreshing=false;}};
  const unsubscribe=transport.subscribe(()=>void refresh(),online=>{if(token!==generation.current)return;setConnected(online);if(online)void resolve();else setEpoch(n=>n+1);});void resolve();
  const recovery=()=>{setEpoch(n=>n+1);if(!document.hidden&&navigator.onLine)void resolve();};
  window.addEventListener('online',recovery);window.addEventListener('offline',recovery);window.addEventListener('focus',recovery);document.addEventListener('visibilitychange',recovery);
  const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  return()=>{mounted.current=false;generation.current++;unsubscribe();clearInterval(timer);window.removeEventListener('online',recovery);window.removeEventListener('offline',recovery);window.removeEventListener('focus',recovery);document.removeEventListener('visibilitychange',recovery);};
 },[transport,accept,resolve]);
 const act=async(intent:ElevenIntent)=>{
  const v=latest.current;if(!v||!connected||flight.current||sessionStorage.getItem(key)||document.hidden||!navigator.onLine)return;
  if(intent.type==='reclaim'){
   if(v.solo||v.finished||v.settled||!v.players.some(p=>p.id===v.viewerId&&p.autoplay))return;
  }else if(!v.canAct||v.paused||intent.type!=='abandon'&&now>=v.board.deadline)return;
  const command:ElevenCommand={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await resolve();
 };
 return {snapshot,error:error||(!connected?'Reconnecting…':''),pending,now,epoch,act,reconnect:()=>{setEpoch(n=>n+1);void resolve();}};
}
