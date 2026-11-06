import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,retireAcknowledgedCommand,scheduleAuthoritativeBoundary} from '@/lib/authoritativeSubscription';
import type {ShowdownTransport} from '@/lib/chuckyShowdown/client';
import type {ShowdownAction,ShowdownCommand,ShowdownView} from '@/lib/chuckyShowdown/model';

export function useChuckyShowdown(id:string,userId:string,transport:ShowdownTransport,liveEntry:boolean){
  const [snapshot,setSnapshot]=useState<ShowdownView|null>(null),[now,setNow]=useState(0);
  const [ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [uncertain,setUncertain]=useState(false);
  const [choice,setChoice]=useState<{revision:number;level?:number;at:number}|null>(null);
  const [recoveryEpoch,setRecoveryEpoch]=useState(0);
  const [livePhase,setLivePhase]=useState('');
  const latest=useRef<ShowdownView|null>(null),clock=useRef({at:0,local:0});
  const lane=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null),busy=useRef(false),epoch=useRef(0);
  const silent=useRef<ShowdownView|null>(null);
  const bornEnded=useRef(false),mounted=useRef(false);
  const key='ptown:chucky-showdown:1:'+userId+':'+id;
  const accept=useCallback((next:ShowdownView,recovering:boolean)=>{
    if(!mounted.current||next.id!==id)return false;
    const prev=latest.current;
    if(prev&&next.revision<prev.revision)return false;
    if(prev&&next.revision===prev.revision){
      if(JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prev,serverAt:0}))return false;
      if(next.serverAt<=prev.serverAt)return true;
    }
    if(!prev)bornEnded.current=next.status!=='active';
    if(!prev||prev.since!==next.since||prev.phase!==next.phase){
      setLivePhase(!recovering&&!document.hidden&&(prev||liveEntry)?next.phase+':'+next.since:'');
    }
    const local=performance.now();
    const at=prev?Math.max(next.serverAt,clock.current.at+local-clock.current.local):next.serverAt;
    silent.current=recovering?next:null;
    latest.current=next;clock.current={at,local};
    setSnapshot(next);setNow(at);setError('');return true;
  },[id,liveEntry]);
  const submit=useCallback(async(live=false)=>{
    const saved=sessionStorage.getItem(key);
    if(!saved||busy.current)return;
    busy.current=true;setPending(true);const ticket=epoch.current;
    try{
      const command=JSON.parse(saved) as ShowdownCommand;
      const value=await transport.send(command);
      retireAcknowledgedCommand(key,saved);
      if(mounted.current){
        setUncertain(false);
        const fresh=live&&ticket===epoch.current;
        accept(value,!fresh);
      }
    }catch(e){
      const definitive=(e as {definitive?:boolean}).definitive;
      if(definitive)retireAcknowledgedCommand(key,saved);
      if(mounted.current)setUncertain(!definitive);
      if(mounted.current){setError((e as Error).message);void lane.current?.refresh();}
    }finally{busy.current=false;if(mounted.current)setPending(!!sessionStorage.getItem(key));}
  },[key,transport,accept]);
  useEffect(()=>{
    mounted.current=true;
    const recovery=createAuthoritativeSubscription({
      subscribe:transport.subscribe,load:transport.load,apply:accept,connected:setReady,error:e=>setError((e as Error).message),
      interrupt:()=>{epoch.current++;setRecoveryEpoch(epoch.current);setLivePhase('');},
      recoverPending:()=>submit(),
    });
    lane.current=recovery;
    const tick=setInterval(()=>{if(!document.hidden)setNow(clock.current.at+performance.now()-clock.current.local);},70);
    return ()=>{mounted.current=false;epoch.current++;clearInterval(tick);recovery.dispose();lane.current=null;};
  },[transport,accept,submit]);
  const due=snapshot?.status==='active'?(snapshot.due):null;
  useEffect(()=>{if(due!=null)return scheduleAuthoritativeBoundary(due-clock.current.at-performance.now()+clock.current.local,()=>lane.current?.refresh());},[due]);
  function act(type:ShowdownAction,level?:number){
    const v=latest.current;
    if(!v||v.status!=='active'||!lane.current?.isReady()||busy.current||sessionStorage.getItem(key))return;
    const at=clock.current.at+performance.now()-clock.current.local;
    if(type!=='abandon'&&(!['decision','fold_stay','choose'].includes(v.phase)||at>=v.due))return;
    const command:ShowdownCommand={requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,intent:{type,level}};
    setChoice({revision:v.revision,level,at});
    sessionStorage.setItem(key,JSON.stringify(command));void submit(true);
  }
  return {snapshot,now,ready,pending,recoveryEpoch,silent:silent.current===snapshot,error:error||(uncertain?'Reconnect to confirm your last move.':''),livePhase,choice:pending&&choice?.revision===snapshot?.revision?choice:null,act,bornEnded:bornEnded.current,reconnect:()=>void lane.current?.recover()};
}
