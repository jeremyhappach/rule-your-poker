import {useCallback,useEffect,useRef,useState} from 'react';
import {acceptWordsSnapshot,type WordsSnapshot,type Intent} from '@/lib/ptownWords/model';
import type {Command,WordsTransport} from '@/lib/ptownWords/client';
/** Pending UUID/payload survives uncertain replies. No client advances a turn. */
export function usePtownWords(id:string,userId:string,transport:WordsTransport){
 const [snapshot,setSnapshot]=useState<WordsSnapshot|null>(null),[error,setError]=useState(''),[errorVersion,setErrorVersion]=useState(0),[pending,setPending]=useState(false),[connected,setConnected]=useState(false),[now,setNow]=useState(0);
 const latest=useRef<WordsSnapshot|null>(null),generation=useRef(0),flight=useRef(false),clock=useRef({server:0,local:0});
 const key=`ptown:words:1:${userId}:${id}`;
 const accept=useCallback((v:WordsSnapshot,token:number)=>{if(token!==generation.current||latest.current&&v.revision<latest.current.revision)return;const next=acceptWordsSnapshot(latest.current,v,id),local=performance.now(),server=latest.current?Math.max(next.serverAt,clock.current.server+local-clock.current.local):next.serverAt;latest.current=next;setSnapshot(next);clock.current={server,local};setNow(server);},[id]);
 const resolve=useCallback(async()=>{if(flight.current)return false;const token=generation.current;flight.current=true;let ok=false;
  try{const saved=sessionStorage.getItem(key);setPending(!!saved);if(saved){try{accept(await transport.send(JSON.parse(saved) as Command),token);sessionStorage.removeItem(key);setError('');ok=true;}catch(e){if(/ptown_words:|42501/.test((e as Error).message)){sessionStorage.removeItem(key);accept(await transport.load(),token);}throw e;}}
   else{accept(await transport.load(),token);setError('');ok=true;}
  }catch(e){if(token===generation.current){setError((e as Error).message);setErrorVersion(n=>n+1);}}finally{if(token===generation.current){flight.current=false;setPending(!!sessionStorage.getItem(key));}}return ok;
 },[key,transport,accept]);
 useEffect(()=>{const token=++generation.current;latest.current=null;flight.current=false;setSnapshot(null);setConnected(false);setError('');
  let busy=false,dirty=false;const refresh=async()=>{dirty=true;if(busy)return;busy=true;try{while(dirty&&generation.current===token){dirty=false;accept(await transport.load(),token);}}catch(e){if(generation.current===token)setError((e as Error).message);}finally{busy=false;}};
  const off=transport.subscribe(()=>void refresh(),online=>{if(token!==generation.current)return;setConnected(online&&navigator.onLine);if(online)void resolve();});void resolve();
  const recover=()=>{if(!navigator.onLine)setConnected(false);if(navigator.onLine&&!document.hidden)void resolve();};
  window.addEventListener('online',recover);window.addEventListener('offline',recover);window.addEventListener('focus',recover);document.addEventListener('visibilitychange',recover);
  const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  return()=>{generation.current++;off();clearInterval(timer);window.removeEventListener('online',recover);window.removeEventListener('offline',recover);window.removeEventListener('focus',recover);document.removeEventListener('visibilitychange',recover);};
 },[transport,accept,resolve]);
 const act=async(intent:Intent)=>{const v=latest.current;if(!v||(intent.type!=='request_pause'&&!v.canAct)||v.paused||!connected||flight.current||sessionStorage.getItem(key)||!navigator.onLine||document.hidden)return false;sessionStorage.setItem(key,JSON.stringify({requestId:crypto.randomUUID(),revision:v.revision,intent}));return resolve();};
 return {snapshot,error,errorVersion,pending,connected,now,act,reconnect:resolve};
}
