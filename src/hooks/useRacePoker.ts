import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptRacePokerSnapshot,racePokerPlayWindow,type RacePokerIntent,type RacePokerSnapshot} from '@/lib/racePoker/model';
export interface RacePokerCommand {requestId:string;revision:number;scope:string;intent:RacePokerIntent}
export interface RacePokerTransport {load:()=>Promise<RacePokerSnapshot>;send:(command:RacePokerCommand)=>Promise<RacePokerSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
/** One immutable pending command. Display clocks never advance authoritative play. */
export function useRacePoker(id:string,userId:string,transport:RacePokerTransport){
 const [snapshot,setSnapshot]=useState<RacePokerSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0),[epoch,setEpoch]=useState(0),[connected,setConnected]=useState<boolean|null>(null);
 const [online,setOnline]=useState(()=>navigator.onLine);
 const reconciling=useRef(0),silencePending=useRef(false);
 const latest=useRef<RacePokerSnapshot|null>(null),flight=useRef(false),mounted=useRef(false),generation=useRef(0),scope=useRef(id),clock=useRef({server:0,local:0});scope.current=id;
 const key=`ptown:race-poker:1:${userId}:${id}`;
 const accept=useCallback((v:RacePokerSnapshot,token:number)=>{if(!mounted.current||scope.current!==id||token!==generation.current)return;const next=acceptRacePokerSnapshot(latest.current,v,id);if(next!==v)return;if(reconciling.current>0||silencePending.current)setEpoch(n=>n+1);latest.current=next;setSnapshot(next);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');},[id]);
 const resolve=useCallback(async(recovering=false)=>{
  if(flight.current){if(recovering)silencePending.current=true;return;}
  const token=generation.current,saved=sessionStorage.getItem(key);
  if(recovering)reconciling.current++;
  if(saved)flight.current=true;
  try{
   if(!saved){accept(await transport.load(),token);return;}
   setPending(true);const command=JSON.parse(saved) as RacePokerCommand;
   try{accept(await transport.send(command),token);sessionStorage.removeItem(key);}
   catch(e){
    // Retire only definitive rejection; uncertain delivery retains UUID/payload.
    if(/stale|inactive|phase|illegal|invalid_command|invalid_action|deadline|replay_conflict|database_rejected/.test((e as Error).message)){
     sessionStorage.removeItem(key);accept(await transport.load(),token);
    }else throw e;
   }
  }catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}
  finally{if(token===generation.current){
   if(recovering)reconciling.current--;
   if(saved){flight.current=false;silencePending.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}
  }}
 },[key,transport,accept]);
 useEffect(()=>{
  mounted.current=true;const token=++generation.current;reconciling.current=0;silencePending.current=false;flight.current=false;latest.current=null;setSnapshot(null);setConnected(null);setError('');setPending(false);
  let refreshing=false,dirty=false;
  const refresh=async()=>{dirty=true;if(refreshing)return;refreshing=true;try{while(dirty&&mounted.current&&token===generation.current){dirty=false;accept(await transport.load(),token);}}catch(e){if(mounted.current&&token===generation.current)setError((e as Error).message);}finally{refreshing=false;}};
  const unsubscribe=transport.subscribe(()=>void refresh(),online=>{if(token!==generation.current)return;setConnected(online);if(online&&latest.current)void resolve(true);else if(!online)setEpoch(n=>n+1);});void resolve();
  const recovery=()=>{setEpoch(n=>n+1);setOnline(navigator.onLine);if(!document.hidden&&navigator.onLine)void resolve(true);};
  window.addEventListener('online',recovery);window.addEventListener('offline',recovery);window.addEventListener('focus',recovery);document.addEventListener('visibilitychange',recovery);
  let timer:ReturnType<typeof setTimeout>,frame:number;
  const tick=()=>{setNow(clock.current.server+performance.now()-clock.current.local);if(latest.current?.board.phase==='stage_complete'&&!document.hidden)frame=requestAnimationFrame(tick);else timer=setTimeout(tick,100);};tick();
  return()=>{mounted.current=false;generation.current++;unsubscribe();clearTimeout(timer);cancelAnimationFrame(frame);window.removeEventListener('online',recovery);window.removeEventListener('offline',recovery);window.removeEventListener('focus',recovery);document.removeEventListener('visibilitychange',recovery);};
 },[transport,accept,resolve]);
 // One request at the persisted boundary, never a polling loop or local advance.
 useEffect(()=>{
  if(!snapshot||snapshot.paused||snapshot.finished||snapshot.board.phase==='complete')return;
  const deadline=snapshot.board.deadline,at=clock.current.server+performance.now()-clock.current.local;
  const timer=setTimeout(()=>void resolve(),Math.max(0,deadline-at));
  return()=>clearTimeout(timer);
 },[snapshot?.scope,snapshot?.board.deadline,snapshot?.paused,snapshot?.finished,resolve]);
 const act=async(intent:RacePokerIntent)=>{
  const v=latest.current,at=clock.current.server+performance.now()-clock.current.local;if(!v||!connected||flight.current||sessionStorage.getItem(key)||!v.canAct||v.paused||document.hidden||!navigator.onLine||!racePokerPlayWindow(v.board,at).playable)return;
  const command:RacePokerCommand={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await resolve();
 };
 return {snapshot:snapshot?.id===id?snapshot:null,error:error||(!online||connected===false?'Connection interrupted. Reconnecting…':''),connected:online&&connected===true,pending,now,epoch,act,reconnect:()=>{setOnline(navigator.onLine);setEpoch(n=>n+1);void resolve(true);}};
}
