import {useCallback,useEffect,useRef,useState} from 'react';
import {useQuintzeeRollTiming} from '@/lib/geometryLab/quintzeeRollTiming';
import type {BlitzCommand,BlitzSnapshot} from '@/lib/horsesBlitz/model';

interface Motion {identity:string;source:BlitzSnapshot;held:number[];landing:BlitzSnapshot|null;settled:boolean;until:number}
/** Presentation only: keep a roll's landing visible even if the server has advanced its bank beat. */
export function useHorsesBlitzRoll(cue:{command:BlitzCommand;snapshot:BlitzSnapshot}|null,error:string,ready:boolean){
 const {durationMs}=useQuintzeeRollTiming();
 const [motion,setMotion]=useState<Motion|null>(null),current=useRef<Motion|null>(null);
 const put=useCallback((next:Motion|null)=>{current.current=next;setMotion(next);},[]);
 const start=(command:BlitzCommand,source:BlitzSnapshot,held:number[])=>put({identity:command.requestId,source,held:[...held],landing:null,settled:false,until:performance.now()+durationMs});
 useEffect(()=>{
  const m=current.current;if(!m||!cue||cue.command.requestId!==m.identity)return;
  put({...m,landing:cue.snapshot});
 },[cue,put]);
 useEffect(()=>{
  if(!motion?.landing)return;
  const timer=setTimeout(()=>{
   if(current.current!==motion)return;
   if(!motion.settled&&motion.landing?.phase==='banking')put({...motion,settled:true,until:performance.now()+450});
   else put(null);
  },Math.max(0,motion.until-performance.now()));
  return()=>clearTimeout(timer);
 },[motion,put]);
 useEffect(()=>{if(error||!ready)put(null);},[error,ready,put]);
 useEffect(()=>{
  const stop=()=>put(null),hidden=()=>{if(document.hidden)stop();};
  window.addEventListener('offline',stop);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('offline',stop);document.removeEventListener('visibilitychange',hidden);};
 },[put]);
 return {motion,start,locked:()=>current.current!==null};
}
