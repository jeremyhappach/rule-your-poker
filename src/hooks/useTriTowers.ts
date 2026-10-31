import {useEffect,useRef,useState,useCallback} from 'react';
import {subscribeAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';
import {supabase} from '@/integrations/supabase/client';
import {acceptSnapshot,submit,triTowersRpc} from '@/lib/triTowers/client';
import type {Intent,Projection,Command} from '@/lib/triTowers/model';
import {useTriIntentBuffer} from './useTriIntentBuffer';
import {triTiming} from '@/lib/triTowers/diagnostics';
export function useTriTowers(dealerGameId:string){
  const [view,setView]=useState<Projection|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false);
  const [pending,setPending]=useState(false),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now());
  const [presentationEpoch,setPresentationEpoch]=useState(0),epoch=useRef(0);
  const interruptInput=useRef(()=>{});
  const interrupt=useCallback(()=>{epoch.current++;setPresentationEpoch(n=>n+1);interruptInput.current();},[]);
  const latest=useRef<Projection|null>(null),inFlight=useRef(false),scope=useRef(dealerGameId);
  const clock=useRef({server:0,local:0});scope.current=dealerGameId;
  const refreshCurrent=useRef<()=>void>(()=>{}),transportRetries=useRef(0),transportScope=useRef(dealerGameId);
  const accept=useCallback((incoming:Projection,recovery=false,requestEpoch=epoch.current)=>{
    if(scope.current!==dealerGameId)return;
    const value=acceptSnapshot(latest.current,incoming,dealerGameId);if(value!==incoming)return;
    if(latest.current&&value.revision>latest.current.revision&&(recovery||requestEpoch!==epoch.current))setPresentationEpoch(n=>n+1);
    latest.current=value;setView(value);clock.current={server:value.serverAt,local:performance.now()};setNow(value.serverAt);setError('');
  },[dealerGameId]);
  const intentView=(v:Projection|null)=>v&&['tri-towers/3','tri-towers/4','tri-towers/5'].includes(v.rules?.version)?{scope:[dealerGameId,v.identity.roundId,v.activePlayerId,v.stage].join(':'),actor:v.viewerId??'',roundId:v.identity.roundId,revision:v.revision,phase:v.phase,waste:v.waste,cards:v.cards,removed:v.removed,allowed:connected&&!error&&v.canAct&&!v.paused&&!document.hidden&&navigator.onLine&&clock.current.server+performance.now()-clock.current.local<v.deadline}:null;
  const buffer=useTriIntentBuffer('multiplayer:'+dealerGameId,()=>intentView(latest.current),async c=>{
    const requestEpoch=epoch.current;
    try{const response=await submit({dealerGameId,requestId:c.requestId,revision:c.revision,intent:c.intent as Intent});accept(response,false,requestEpoch);triTiming('snapshot-accepted',c.requestId,undefined,c.scope+':'+response.revision);return intentView(response)!;}
    catch(e){try{accept(await triTowersRpc<Projection>('tri_towers_snapshot',{p_dealer_game_id:dealerGameId}),true);}catch{/* Retain uncertain immutable command. */}throw e;}
  });
  const bufferRef=useRef(buffer);bufferRef.current=buffer;
  interruptInput.current=()=>buffer.interrupt();
  useEffect(()=>{
    let alive=true,busy=false,dirty=false,subscribed=false,recovering=false;
    if(transportScope.current!==dealerGameId){transportScope.current=dealerGameId;transportRetries.current=0;}
    if(latest.current?.identity.dealerGameId!==dealerGameId){latest.current=null;setView(null);}
    setConnected(false);inFlight.current=false;setPending(false);
    const refresh=async(recovery=false)=>{
      dirty=true;recovering ||= recovery;if(busy)return;busy=true;
      try{while(alive&&dirty){dirty=false;const restored=recovering,requestEpoch=epoch.current;recovering=false;const snapshot=await triTowersRpc<Projection>('tri_towers_snapshot',{p_dealer_game_id:dealerGameId});if(alive){accept(snapshot,restored,requestEpoch);setConnected(subscribed);}}}
      catch(e){if(alive){setError((e as Error).message);setConnected(false);interrupt();}}finally{busy=false;}
    };
    refreshCurrent.current=()=>void refresh(true);
    const channel=supabase.channel(`tri-towers:${dealerGameId}:${crypto.randomUUID()}`).on('postgres_changes',{
      event:'*',schema:'public',table:'tri_towers_revisions',filter:`dealer_game_id=eq.${dealerGameId}`,
    },()=>void refresh()).subscribe(status=>{if(!alive)return;if(status==='SUBSCRIBED'){subscribed=true;transportRetries.current=0;void refresh(true);}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){subscribed=false;setConnected(false);interrupt();if(transportRetries.current++<2)setRetry(n=>n+1);}},5000);
    void refresh(retry>0);
    const resume=()=>{interrupt();bufferRef.current.interrupt();void bufferRef.current.recover().then(()=>{if(!alive)return;if(!subscribed){transportRetries.current=0;setRetry(n=>n+1);}else void refresh(true);});};const visibility=()=>{if(!document.hidden)resume();else interrupt();};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('offline',interrupt);document.addEventListener('visibilitychange',visibility);
    const stopRecovery=subscribeAuthoritativeRecoverySnapshot(resume);
    const pausedCheck=setInterval(()=>{if(latest.current?.paused&&!document.hidden&&navigator.onLine)resume();},5000);
    // Display only; no polling, legal actions or progression on this clock.
    const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
    return()=>{alive=false;stopRecovery();clearInterval(pausedCheck);clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);window.removeEventListener('offline',interrupt);document.removeEventListener('visibilitychange',visibility);void supabase.removeChannel(channel);};
  },[dealerGameId,accept,retry,interrupt]);
  // Bounded authoritative catch-up at a persisted boundary. The server recovery
  // worker may run just after that boundary, so a first unchanged read is not
  // sufficient. A changed phase/deadline cancels the remaining reads.
  useEffect(()=>{
    if(!view||view.identity.dealerGameId!==dealerGameId||view.paused||view.phase==='complete')return;
    const at=clock.current.server+performance.now()-clock.current.local;
    const delay=Math.max(0,view.deadline-at);if(!Number.isFinite(delay)||delay>2147483647)return;
    const timers=[0,1000,3000].map(grace=>setTimeout(()=>refreshCurrent.current(),delay+grace));
    return()=>timers.forEach(clearTimeout);
  },[dealerGameId,view?.identity.roundId,view?.phase,view?.deadline,view?.paused]);
  const act=async(intent:Intent)=>{
    if(!connected||error||document.hidden||!navigator.onLine||latest.current?.paused||clock.current.server+performance.now()-clock.current.local>=(latest.current?.deadline??0))return;
    if(intentView(latest.current)){buffer.enqueue(intent);return;}
    const current=latest.current;if(!current?.canAct||inFlight.current)return;
    const id=dealerGameId,requestEpoch=epoch.current,command:Command={dealerGameId:id,requestId:crypto.randomUUID(),revision:current.revision,intent};
    inFlight.current=true;setPending(true);
    try{let response:Projection;try{response=await submit(command);}catch(e){if(!(e instanceof TypeError))throw e;response=await submit(command);}if(scope.current===id)accept(response,false,requestEpoch);}
    catch(e){if(scope.current===id){setError((e as Error).message);setRetry(v=>v+1);}}
    finally{if(scope.current===id){inFlight.current=false;setPending(false);}}
  };
  const input=intentView(view)?buffer:undefined;
  return {view:view?.identity.dealerGameId===dealerGameId?view:null,now,pending:pending||!!input?.busy,error,connected,act,input,presentationEpoch,reconnect:()=>{interrupt();buffer.interrupt();void buffer.recover().then(()=>setRetry(v=>v+1));}};
}
