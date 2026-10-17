import {useEffect,useRef,useState,useCallback} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {acceptSnapshot,submit,triTowersRpc} from '@/lib/triTowers/client';
import type {Intent,Projection,Command} from '@/lib/triTowers/model';
export function useTriTowers(dealerGameId:string){
  const [view,setView]=useState<Projection|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false);
  const [pending,setPending]=useState(false),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now());
  const [presentationEpoch,setPresentationEpoch]=useState(0),epoch=useRef(0);
  const interrupt=useCallback(()=>{epoch.current++;setPresentationEpoch(n=>n+1);},[]);
  const latest=useRef<Projection|null>(null),inFlight=useRef(false),scope=useRef(dealerGameId);
  const clock=useRef({server:0,local:0});scope.current=dealerGameId;
  const accept=useCallback((incoming:Projection,recovery=false,requestEpoch=epoch.current)=>{
    if(scope.current!==dealerGameId)return;
    const value=acceptSnapshot(latest.current,incoming,dealerGameId);if(value!==incoming)return;
    if(latest.current&&value.revision>latest.current.revision&&(recovery||requestEpoch!==epoch.current))setPresentationEpoch(n=>n+1);
    latest.current=value;setView(value);clock.current={server:value.serverAt,local:performance.now()};setNow(value.serverAt);setError('');
  },[dealerGameId]);
  useEffect(()=>{
    let alive=true,busy=false,dirty=false,subscribed=false,recovering=false;
    if(latest.current?.identity.dealerGameId!==dealerGameId){latest.current=null;setView(null);}
    setConnected(false);inFlight.current=false;setPending(false);
    const refresh=async(recovery=false)=>{
      dirty=true;recovering ||= recovery;if(busy)return;busy=true;
      try{while(alive&&dirty){dirty=false;const restored=recovering,requestEpoch=epoch.current;recovering=false;const snapshot=await triTowersRpc<Projection>('tri_towers_snapshot',{p_dealer_game_id:dealerGameId});if(alive){accept(snapshot,restored,requestEpoch);setConnected(subscribed);}}}
      catch(e){if(alive){setError((e as Error).message);setConnected(false);interrupt();}}finally{busy=false;}
    };
    const channel=supabase.channel(`tri-towers:${dealerGameId}:${crypto.randomUUID()}`).on('postgres_changes',{
      event:'*',schema:'public',table:'tri_towers_revisions',filter:`dealer_game_id=eq.${dealerGameId}`,
    },()=>void refresh()).subscribe(status=>{if(!alive)return;if(status==='SUBSCRIBED'){subscribed=true;void refresh(true);}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){subscribed=false;setConnected(false);interrupt();}});
    void refresh(retry>0);
    const resume=()=>{interrupt();void refresh(true);};const visibility=()=>{interrupt();if(!document.hidden)void refresh(true);};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('offline',interrupt);document.addEventListener('visibilitychange',visibility);
    // Display only; no polling, legal actions or progression on this clock.
    const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);window.removeEventListener('offline',interrupt);document.removeEventListener('visibilitychange',visibility);void supabase.removeChannel(channel);};
  },[dealerGameId,accept,retry,interrupt]);
  const act=async(intent:Intent)=>{
    const current=latest.current;if(!current?.canAct||inFlight.current)return;
    const id=dealerGameId,requestEpoch=epoch.current,command:Command={dealerGameId:id,requestId:crypto.randomUUID(),revision:current.revision,intent};
    inFlight.current=true;setPending(true);
    try{let response:Projection;try{response=await submit(command);}catch(e){if(!(e instanceof TypeError))throw e;response=await submit(command);}if(scope.current===id)accept(response,false,requestEpoch);}
    catch(e){if(scope.current===id){setError((e as Error).message);setRetry(v=>v+1);}}
    finally{if(scope.current===id){inFlight.current=false;setPending(false);}}
  };
  return {view:view?.identity.dealerGameId===dealerGameId?view:null,now,pending,error,connected,act,presentationEpoch,reconnect:()=>{interrupt();setRetry(v=>v+1);}};
}
