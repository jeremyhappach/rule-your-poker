import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,scheduleAuthoritativeBoundary,retireAcknowledgedCommand} from '@/lib/authoritativeSubscription';
import {megaLiveRequest,type MegaLiveView} from '@/lib/megaCardGolf/liveClient';
import type {Intent} from '@/lib/megaCardGolf/engine';
import {supabase} from '@/integrations/supabase/client';
export function useMegaMatch(id:string,userId:string){
 const [snapshot,setSnapshot]=useState<MegaLiveView|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[connected,setConnected]=useState(false),[now,setNow]=useState(0);
 const latest=useRef<MegaLiveView|null>(null),clock=useRef({server:0,local:0}),generation=useRef(0),flight=useRef(false),recovery=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null);
 const key='ptown:mega-live:1:'+userId+':'+id;
 const accept=useCallback((v:MegaLiveView)=>{
  if(v.id!==id)throw Error('mega:identity');const old=latest.current;
  if(old&&v.revision<old.revision)return;
  if(old&&v.revision===old.revision){const semantic=(s:MegaLiveView)=>JSON.stringify({...s,serverAt:0,financial:undefined,players:s.players.map(({chips,...p})=>p),board:s.board?{...s.board,serverAt:0}:null});if(semantic(old)!==semantic(v))throw Error('mega:conflicting_snapshot');}
  latest.current=v;setSnapshot(v);clock.current={server:v.serverAt,local:performance.now()};setNow(v.serverAt);setError('');
 },[id]);
 const resolve=useCallback(async()=>{
  if(flight.current)return;flight.current=true;const token=generation.current,saved=sessionStorage.getItem(key);setPending(!!saved);
  try{try{const value=await megaLiveRequest(saved?JSON.parse(saved):{op:'state',matchId:id});if(token===generation.current){accept(value);if(saved)retireAcknowledgedCommand(key,saved);}}
   catch(e){if(saved&&/mega:(stale_action|deadline|inactive|invalid_action|not_actor)/.test((e as Error).message)){if(token===generation.current)retireAcknowledgedCommand(key,saved);const value=await megaLiveRequest({op:'state',matchId:id});if(token===generation.current)accept(value);}else throw e;}
  }catch(e){if(token===generation.current)setError((e as Error).message);}finally{if(token===generation.current){flight.current=false;setPending(!!sessionStorage.getItem(key));}}
 },[id,key,accept]);
 useEffect(()=>{
  const token=++generation.current;latest.current=null;setSnapshot(null);flight.current=false;setError('');
  const owner=createAuthoritativeSubscription({isPaused:()=>!!latest.current?.paused,
   subscribe:(refresh,status)=>{const channel=supabase.channel('mega-live:'+id+':'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'mega_live_revisions',filter:'dealer_game_id=eq.'+id},refresh).subscribe(state=>status(state==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};},
   load:()=>megaLiveRequest({op:'state',matchId:id}),apply:(v)=>{if(token!==generation.current)return false;accept(v);return latest.current===v;},connected:setConnected,error:e=>setError((e as Error).message),interrupt:()=>{},recoverPending:async()=>{if(sessionStorage.getItem(key))await resolve();}});
  recovery.current=owner;const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
  return()=>{generation.current++;owner.dispose();clearInterval(timer);};
 },[id,key,accept,resolve]);
 const deadline=snapshot?.settled?snapshot.terminal?.deadline:snapshot?.deadline;
 useEffect(()=>{if(deadline==null||snapshot?.paused||snapshot?.finished)return;return scheduleAuthoritativeBoundary(deadline-clock.current.server,()=>recovery.current?.refresh());},[deadline,snapshot?.revision,snapshot?.paused,snapshot?.finished]);
 const act=async(intent:Intent)=>{const v=latest.current;if(!v?.canAct||!connected||!recovery.current?.isReady()||flight.current||sessionStorage.getItem(key)||document.hidden||!navigator.onLine)return;
  sessionStorage.setItem(key,JSON.stringify({op:'action',matchId:id,revision:v.revision,scope:v.scope,requestId:crypto.randomUUID(),intent}));await resolve();};
 return {snapshot:snapshot?.id===id?snapshot:null,pending,error,connected,now,act,reconnect:()=>recovery.current?.recover()};
}
