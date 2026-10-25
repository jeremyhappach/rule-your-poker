import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptQuintzeeSnapshot,type QuintzeeIntent,type QuintzeeSnapshot} from '@/lib/quintzee/model';
export interface QuintzeeCommand {requestId:string;revision:number;scope:string;intent:QuintzeeIntent}
export interface QuintzeeTransport {load:()=>Promise<QuintzeeSnapshot>;send:(command:QuintzeeCommand)=>Promise<QuintzeeSnapshot>;subscribe:(refresh:()=>void)=>()=>void}
/** Transport-neutral projection. Durable commands retain their UUID across reconnects. */
export function useQuintzee(id:string,actor:string,transport:QuintzeeTransport){
 const [snapshot,setSnapshot]=useState<QuintzeeSnapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(0);
 const current=useRef<QuintzeeSnapshot|null>(null),anchor=useRef({server:0,local:0}),flight=useRef<string|null>(null),alive=useRef(true);
 const key=`quintzee:${id}:${actor}:pending`;
 const identity=useRef(key);identity.current=key;
 const accept=useCallback((v:QuintzeeSnapshot)=>{
  if(!alive.current||identity.current!==key||v.id!==id||!acceptQuintzeeSnapshot(current.current,v))return;
  current.current=v;anchor.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setSnapshot(v);setError('');
 },[id,key]);
 const reconnect=useCallback(async()=>{
  if(flight.current===key)return;
  flight.current=key;
  try{
   const saved=sessionStorage.getItem(key);
   if(saved){setPending(true);accept(await transport.send(JSON.parse(saved)));sessionStorage.removeItem(key);}
   accept(await transport.load());
  }catch(e){
   // Only a definite server rejection retires the intent; transport loss keeps it.
   if((e as {definitive?:boolean}).definitive)sessionStorage.removeItem(key);
   if(alive.current&&identity.current===key)setError((e as Error).message);
  }
  finally{if(flight.current===key)flight.current=null;if(alive.current&&identity.current===key)setPending(!!sessionStorage.getItem(key));}
 },[accept,key,transport]);
 const act=useCallback(async(intent:QuintzeeIntent)=>{
  const v=current.current;if(!v||v.id!==id||flight.current===key||sessionStorage.getItem(key))return;
  const command={requestId:crypto.randomUUID(),revision:v.revision,scope:v.scope,intent};
  sessionStorage.setItem(key,JSON.stringify(command));await reconnect();
 },[id,key,reconnect]);
 useEffect(()=>{
  alive.current=true;current.current=null;setSnapshot(null);void reconnect();
  const dispose=transport.subscribe(()=>void reconnect()),refresh=()=>void reconnect();
  window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
  return()=>{alive.current=false;dispose();window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);};
 },[reconnect,transport]);
 useEffect(()=>{
  let frame:number,last=0;
  const draw=(at:number)=>{if(at-last>=100){last=at;setNow(anchor.current.server+Math.max(0,at-anchor.current.local));}frame=requestAnimationFrame(draw);};
  frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{
  if(!snapshot||snapshot.status!=='active'||snapshot.state.finished||snapshot.pausedAt!==null)return;
  const due=snapshot.state.board.deadline-(anchor.current.server+performance.now()-anchor.current.local);
  const timer=setTimeout(()=>void reconnect(),Math.max(0,due)+25);return()=>clearTimeout(timer);
 },[snapshot,reconnect]);
 return {snapshot,error,pending,now,act,reconnect};
}
