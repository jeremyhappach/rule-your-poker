import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {Session} from '@supabase/supabase-js';
import type {AccountAccess} from '@/lib/accountAccess';

type Destination={eventId:string;matchId:string;userId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function currentSession(session:Session|null|undefined):session is Session {
 return !!session?.user.id&&Number.isFinite(session.expires_at)&&session.expires_at!*1000>Date.now();
}

/** Receives the destination above gated children; never grants access itself. */
export function usePushMatchNavigation({session,access,checking,error,restoreSession}:{
 session:Session|null|undefined;access:AccountAccess|null;checking:boolean;error:string;restoreSession:()=>void;
}) {
 const navigate=useNavigate(),[pending,setPending]=useState<Destination|null>(null);
 const received=useRef(new Set<string>()),restoring=useRef<string|null>(null);
 const clear=useCallback(()=>{setPending(null);restoring.current=null;},[]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.data?.type!=='push-match-navigation')return;
   const worker=event.source as ServiceWorker|null;
   if(!worker?.scriptURL)return;
   const source=new URL(worker.scriptURL,window.location.origin);
   if(source.origin!==window.location.origin||source.pathname!=='/ptown-push-sw.js')return;
   const target=event.data.destination as Destination|undefined;
   if(!target||![target.eventId,target.matchId,target.userId].every(value=>typeof value==='string'&&uuid.test(value)))return;
   const key=target.userId+':'+target.eventId;
   if(!received.current.has(key)){
    received.current.add(key);
    if(received.current.size>128)received.current.delete(received.current.values().next().value!);
    setPending({eventId:target.eventId,matchId:target.matchId,userId:target.userId});
   }
   // Receipt acknowledgement, not an access decision. The gate owns admission.
   event.ports[0]?.postMessage({accepted:true,eventId:target.eventId});
  };
  navigator.serviceWorker?.addEventListener('message',receive);
  return()=>navigator.serviceWorker?.removeEventListener('message',receive);
 },[]);
 useEffect(()=>{
  if(!pending||checking)return;
  if(session===undefined)return;
  if(session===null){navigate('/auth',{replace:true});return;}
  if(session.user.id!==pending.userId){clear();return;}
  if(!currentSession(session)){
   if(restoring.current!==pending.eventId){restoring.current=pending.eventId;restoreSession();}
   return;
  }
  if(error||!access||access.userId!==pending.userId||!access.enabled)return;
  clear();
  navigate('/delayed/'+pending.matchId,{state:{asyncPushEventId:pending.eventId}});
 },[pending,session,access,checking,error,restoreSession,clear,navigate]);
 return {pending,clear};
}
