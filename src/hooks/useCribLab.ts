import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthoritativeSubscription,retireAcknowledgedCommand,scheduleAuthoritativeBoundary} from '@/lib/authoritativeSubscription';
import type {LabTransport} from '@/lib/cribLab/client';
import type {LabAction,LabCommand,LabSnapshot} from '@/lib/cribLab/model';

export function useCribLab(id:string,userId:string,transport:LabTransport,liveEntry:boolean){
  const [snapshot,setSnapshot]=useState<LabSnapshot|null>(null),[now,setNow]=useState(0);
  const [ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [uncertain,setUncertain]=useState(false);
  const [deal,setDeal]=useState(''),[count,setCount]=useState(''),[cue,setCue]=useState<LabCommand|null>(null);
  const latest=useRef<LabSnapshot|null>(null),clock=useRef({at:0,local:0});
  const lane=useRef<ReturnType<typeof createAuthoritativeSubscription>|null>(null),busy=useRef(false),epoch=useRef(0);
  const bornEnded=useRef(false),mounted=useRef(false);
  const key='ptown:crib-lab:1:'+userId+':'+id;
  const accept=useCallback((next:LabSnapshot,recovering:boolean)=>{
    if(!mounted.current||next.id!==id)return false;
    const prev=latest.current;
    if(prev&&next.revision<prev.revision)return false;
    if(prev&&next.revision===prev.revision){
      if(JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prev,serverAt:0}))return false;
      if(next.serverAt<=prev.serverAt)return true;
    }
    if(!prev)bornEnded.current=next.status!=='active';
    if(!recovering&&!document.hidden){
      if(next.phase==='discard'&&next.roundId!==prev?.roundId&&(prev||liveEntry)&&next.serverAt-next.deadline+next.durationMs<2200)setDeal(next.roundId);
      if(next.result&&prev?.roundId===next.roundId&&!prev.result&&next.serverAt-next.result.scoredAt<1250)setCount(next.roundId);
    }
    latest.current=next; clock.current={at:next.serverAt,local:performance.now()};
    setSnapshot(next);setNow(next.serverAt);setError('');return true;
  },[id,liveEntry]);
  const submit=useCallback(async(live=false)=>{
    const saved=sessionStorage.getItem(key);
    if(!saved||busy.current)return;
    busy.current=true;setPending(true);const ticket=epoch.current;
    try{
      const command=JSON.parse(saved) as LabCommand;
      const value=await transport.send(command);
      retireAcknowledgedCommand(key,saved);
      if(mounted.current){
        setUncertain(false);
        const fresh=live&&ticket===epoch.current;
        accept(value,!fresh);
        if(fresh&&value.roundId===command.roundId&&latest.current?.revision===value.revision&&value.revision===command.revision+1)setCue(command);
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
      interrupt:()=>{epoch.current++;setDeal('');setCount('');setCue(null);},
      recoverPending:()=>submit(),
    });
    lane.current=recovery;
    const tick=setInterval(()=>{if(!document.hidden)setNow(clock.current.at+performance.now()-clock.current.local);},70);
    return ()=>{mounted.current=false;epoch.current++;clearInterval(tick);recovery.dispose();lane.current=null;};
  },[transport,accept,submit]);
  const due=snapshot?.status==='active'?(snapshot.phaseUntil??snapshot.deadline):null;
  useEffect(()=>{if(due!=null)return scheduleAuthoritativeBoundary(due-clock.current.at-performance.now()+clock.current.local,()=>lane.current?.refresh());},[due]);
  function act(type:LabAction,items:number[]=[]){
    const v=latest.current;
    if(!v||v.status!=='active'||!lane.current?.isReady()||busy.current||sessionStorage.getItem(key))return;
    const command:LabCommand={requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,intent:{type,items}};
    sessionStorage.setItem(key,JSON.stringify(command));void submit(true);
  }
  return {snapshot,now,ready,pending,error:error||(uncertain?'Reconnect to confirm your last move.':''),deal,count,cue,act,bornEnded:bornEnded.current,reconnect:()=>void lane.current?.recover()};
}
