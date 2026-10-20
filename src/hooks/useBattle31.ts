import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptBattle31Snapshot,battle31PlayWindow,type Battle31Intent,type Battle31Snapshot} from '@/lib/battle31/model';
export interface Battle31Command {requestId:string;revision:number;scope:string;intent:Battle31Intent}
export interface Battle31Transport {load:()=>Promise<Battle31Snapshot>;send:(command:Battle31Command)=>Promise<Battle31Snapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
/** One immutable pending command. Display clocks never advance authoritative play. */
export function useBattle31(id:string,userId:string,transport:Battle31Transport){
 const [snapshot,setSnapshot]=useState<Battle31Snapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0),[epoch,setEpoch]=useState(0),[connected,setConnected]=useState<boolean|null>(null);
 const [online,setOnline]=useState(()=>navigator.onLine);
 const latest=useRef<Battle31Snapshot|null>(null),flight=useRef(false),mounted=useRef(false),generation=useRef(0),scope=useRef(id),clock=useRef({server:0,local:0});scope.current=id;
 const key=`ptown:battle31:1:${userId}:${id}`;
 const accept=useCallback((v:Battle31Snapshot,token:number)=>{if(!mounted.current||scope.current!==id||token!==generation.current)return;const next=acceptBattle31Snapshot(latest.current,v,id);if(next!==v)return;latest.current=next;setSnapshot(next);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');},[id]);
 const resolve=useCallback(async()=>{
  if(flight.current)return;const token=generation.current,saved=sessionStorage.getItem(key);
  if(!saved){try{accept(await transport.load(),token);}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}return;}
  flight.current=true;
  try{
   if(saved){setPending(true);const command=JSON.parse(saved) as Battle31Command;
    try{accept(await transport.send(command),token);sessionStorage.removeItem(key);}
    catch(e){
     // Definitive server rejection retires this intent. Network uncertainty keeps
     // exactly the same UUID/payload across reload; never mint a replacement.
     if(/stale|inactive|phase|illegal|deadline|wrong_turn|forbidden|invalid_command|invalid_action|database_rejected/.test((e as Error).message)){sessionStorage.removeItem(key);accept(await transport.load(),token);}
     else throw e;
    }
   }else accept(await transport.load(),token);
  }catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{if(token===generation.current){flight.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;const token=++generation.current;flight.current=false;latest.current=null;setSnapshot(null);setConnected(null);setError('');setPending(false);
  let refreshing=false,dirty=false;
  const refresh=async()=>{dirty=true;if(refreshing)return;refreshing=true;try{while(dirty&&mounted.current&&token===generation.current){dirty=false;accept(await transport.load(),token);}}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{refreshing=false;}};
  const unsubscribe=transport.subscribe(()=>void refresh(),online=>{if(token!==generation.current)return;setConnected(online);if(online&&latest.current)void resolve();else if(!online)setEpoch(n=>n+1);});void resolve();
  const recovery=()=>{setEpoch(n=>n+1);setOnline(navigator.onLine);if(!document.hidden&&navigator.onLine)void resolve();};
  window.addEventListener('online',recovery);window.addEventListener('offline',recovery);window.addEventListener('focus',recovery);document.addEventListener('visibilitychange',recovery);
  let timer:ReturnType<typeof setTimeout>,frame:number;
  const tick=()=>{setNow(clock.current.server+performance.now()-clock.current.local);if(latest.current?.board.phase==='round_result'&&!document.hidden)frame=requestAnimationFrame(tick);else timer=setTimeout(tick,100);};tick();
  return()=>{mounted.current=false;generation.current++;unsubscribe();clearTimeout(timer);cancelAnimationFrame(frame);window.removeEventListener('online',recovery);window.removeEventListener('offline',recovery);window.removeEventListener('focus',recovery);document.removeEventListener('visibilitychange',recovery);};
 },[transport,accept,resolve]);
 // One request at the persisted boundary, never a polling loop or local advance.
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished||snapshot.board.phase==='complete')return;
  const deadline=snapshot.board.deadline,at=clock.current.server+performance.now()-clock.current.local;
  const timer=setTimeout(()=>void resolve(),Math.max(0,deadline-at));
  return()=>clearTimeout(timer);
 },[snapshot?.scope,snapshot?.board.deadline,snapshot?.paused,snapshot?.finished,resolve]);
 const act=async(intent:Battle31Intent)=>{
  const v=latest.current,at=clock.current.server+performance.now()-clock.current.local;if(!v||!connected||flight.current||sessionStorage.getItem(key)||intent.type!=='resign'&&!v.canAct||v.paused||document.hidden||!navigator.onLine||intent.type!=='resign'&&!battle31PlayWindow(v.board,at).playable)return;
  const command:Battle31Command={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await resolve();
 };
 return {snapshot:snapshot?.id===id?snapshot:null,error:error||(!online||connected===false?'Connection interrupted. Reconnecting…':''),connected:online&&connected===true,pending,now,epoch,act,reconnect:()=>{setOnline(navigator.onLine);setEpoch(n=>n+1);void resolve();}};
}
