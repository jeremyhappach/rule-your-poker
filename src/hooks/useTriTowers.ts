import {useEffect,useRef,useState,useCallback} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {acceptSnapshot,submit,triTowersRpc} from '@/lib/triTowers/client';
import type {Intent,Projection,Command} from '@/lib/triTowers/model';
export function useTriTowers(dealerGameId:string){
  const [view,setView]=useState<Projection|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false);
  const [pending,setPending]=useState(false),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now());
  const latest=useRef<Projection|null>(null),inFlight=useRef(false),scope=useRef(dealerGameId);
  const clock=useRef({server:0,local:0});scope.current=dealerGameId;
  const accept=useCallback((incoming:Projection)=>{
    if(scope.current!==dealerGameId)return;
    const value=acceptSnapshot(latest.current,incoming,dealerGameId);if(value!==incoming)return;
    latest.current=value;setView(value);clock.current={server:value.serverAt,local:performance.now()};setNow(value.serverAt);setError('');
  },[dealerGameId]);
  useEffect(()=>{
    let alive=true,busy=false,dirty=false,subscribed=false;
    if(latest.current?.identity.dealerGameId!==dealerGameId){latest.current=null;setView(null);}
    setConnected(false);inFlight.current=false;setPending(false);
    const refresh=async()=>{
      dirty=true;if(busy)return;busy=true;
      try{while(alive&&dirty){dirty=false;const snapshot=await triTowersRpc<Projection>('tri_towers_snapshot',{p_dealer_game_id:dealerGameId});if(alive){accept(snapshot);setConnected(subscribed);}}}
      catch(e){if(alive){setError((e as Error).message);setConnected(false);}}finally{busy=false;}
    };
    const channel=supabase.channel(`tri-towers:${dealerGameId}:${crypto.randomUUID()}`).on('postgres_changes',{
      event:'*',schema:'public',table:'tri_towers_revisions',filter:`dealer_game_id=eq.${dealerGameId}`,
    },()=>void refresh()).subscribe(status=>{if(!alive)return;if(status==='SUBSCRIBED'){subscribed=true;void refresh();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){subscribed=false;setConnected(false);}});
    void refresh();
    const resume=()=>void refresh();window.addEventListener('online',resume);window.addEventListener('focus',resume);
    // Display only; no polling, legal actions or progression on this clock.
    const timer=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.local),100);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);void supabase.removeChannel(channel);};
  },[dealerGameId,accept,retry]);
  const act=async(intent:Intent)=>{
    const current=latest.current;if(!current?.canAct||inFlight.current)return;
    const id=dealerGameId,command:Command={dealerGameId:id,requestId:crypto.randomUUID(),revision:current.revision,intent};
    inFlight.current=true;setPending(true);
    try{let response:Projection;try{response=await submit(command);}catch(e){if(!(e instanceof TypeError))throw e;response=await submit(command);}if(scope.current===id)accept(response);}
    catch(e){if(scope.current===id){setError((e as Error).message);setRetry(v=>v+1);}}
    finally{if(scope.current===id){inFlight.current=false;setPending(false);}}
  };
  return {view:view?.identity.dealerGameId===dealerGameId?view:null,now,pending,error,connected,act,reconnect:()=>setRetry(v=>v+1)};
}
